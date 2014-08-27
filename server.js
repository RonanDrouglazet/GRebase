var express = require("express"),
io = require("socket.io"),
http = require("http"),
fs = require("fs"),
cp = require('child_process');

var GRebase = express();
var serverIo = http.createServer(GRebase);
var socketIo = io.listen(serverIo);

//static
GRebase.use("/", express.static(__dirname + "/static/"))
.use("/log/", express.static("/tmp/"))

//404 not found
.use(function(req, res, next) {
    res.setHeader("Content-Type", "text/plain");
    res.send(404, "Not Found");
});

//socket io event for web interface
socketIo.on("connection", function(socket) {
    socket.on("rebase", askRebase);
    socket.on("recover", askRecover);
    socket.emit("update", config);
});

//###############################################################

var config;
var STATUS = {
    UNCHECKED: 1,
    UP_TO_DATE: 2,
    NEED_REBASE: 3,
    REBASE_FAILED: 4,
    ONGOING: 5
}

// init, read config.json
var init = function() {
    fs.readFile(__dirname + "/config.json", function(err, data) {
        if (!err) {
            createConfig(JSON.parse(data), 0);
        } else {
            log(true, ["GReabase error: please put config.json on GRebase root directory"]);
        }
    });
};

// update branch list for each project before begin to check
var startProcess = function() {
    fs.writeFile("/tmp/grebase.log", "");
    updateBranchList(function(err) {
        if (!err) {
            updateBackup(function() {
                checkEachProject(0);
            });
        } else {
            log(true, [err]);
        }
    });
};

// check each project find on config.json. For each, check all his branch
var checkEachProject = function(current) {
    if (current < config.length) {
        checkEachBranch(config[current], 0, function() {
            checkEachProject(current + 1);
        });
    } else {
        startProcess();
    }
};

// core ! checkout on branch, reset / pull / rebase it, and get last commit author from it. Determine the branch rebase status
var checkEachBranch = function(repo, current, done) {
    if (current < repo.branch.length) {
        repo.branch[current].status = STATUS.ONGOING;
        socketIo.sockets.emit("update", config);

        //checkout on branch
        exec("repos/" + repo.name, "git checkout " + repo.branch[current].name, function(err, stdout, stderr) {
            if (!err) {
                // if  a recover asked on this branch, reset it from backup and push on origin
                if (repo.branch[current].recover) {
                    repo.branch[current].recover = false;
                    exec("repos/" + repo.name, "git reset --hard " + repo.branch[current].name + "_backup" +
                        " && git push -f origin " + repo.branch[current].name, function(err, stdout, stderr) {
                        if (!err) {
                            repo.branch[current].status = STATUS.UNCHECKED;
                        }
                        // re check the current branch after the recover
                        checkEachBranch(repo, current, done);
                    });
                } else {
                   // reset and pull
                    exec("repos/" + repo.name, "git reset --hard origin/" + repo.branch[current].name + " && git pull --rebase", function(err, stdout, stderr) {
                        //get last commit author
                        exec("repos/" + repo.name, "git --no-pager show -s --format='%an <%ae>' HEAD", function(err, stdout, stderr) {
                            repo.branch[current].lastCommit = stdout;

                            // get the rebase origin from config rules for this branch
                            getRebaseOrigin(repo, repo.branch[current].name, function(rebaseOrigin) {
                                if (rebaseOrigin) {
                                    repo.branch[current].parent = rebaseOrigin;
                                    getMissingCommits(repo, current, rebaseOrigin);

                                    // try to rebase from origin
                                    exec("repos/" + repo.name, "git rebase origin/" + rebaseOrigin, function(err, stdout, stderr) {
                                        if (err) {
                                            log(false, ["REBASE AUTO FAILED FOR " + repo.branch[current].name]);
                                            repo.branch[current].status = STATUS.REBASE_FAILED;
                                            //check with a merge if we really need a rebase, sometimes not..
                                            exec("repos/" + repo.name, "git rebase --abort && git merge origin/" + rebaseOrigin, function(err, stdout, stderr) {
                                                if (stdout === "Already up-to-date.\n") {
                                                    repo.branch[current].status = STATUS.UP_TO_DATE;
                                                }
                                                exec("repos/" + repo.name, "git reset --hard origin/" + repo.branch[current].name, function(err, stdout, stderr) {
                                                    checkEachBranch(repo, current + 1, done);
                                                });
                                            });
                                        } else {
                                            if (stdout.endsWith("is up to date.\n")) {
                                                log(false, ["UP TO DATE " + repo.branch[current].name]);
                                                repo.branch[current].status = STATUS.UP_TO_DATE;
                                                checkEachBranch(repo, current + 1, done);
                                            } else {
                                                log(false, ["REBASE NEEDED FOR " + repo.branch[current].name]);
                                                repo.branch[current].status = STATUS.NEED_REBASE;

                                                // if rebase asked on this branch
                                                if (repo.branch[current].rebase) {
                                                    repo.branch[current].rebase = false;
                                                    //create a backup branch and push -f
                                                    exec("repos/" + repo.name, "git reset --hard origin/" + repo.branch[current].name +
                                                        " && git branch -f " + repo.branch[current].name + "_backup && git rebase origin/" + rebaseOrigin +
                                                        " && git push -f origin " + repo.branch[current].name, function(err, stdout, stderr) {
                                                        if (!err) {
                                                            repo.branch[current].status = STATUS.UP_TO_DATE;
                                                            repo.branch[current].backup = config.backup[repo.url][repo.branch[current].name] = new Date().toLocaleString();
                                                            writeBackup(config.backup);
                                                        }
                                                        checkEachBranch(repo, current + 1, done);
                                                    });
                                                } else {
                                                    checkEachBranch(repo, current + 1, done);
                                                }
                                            }
                                        }
                                    });
                                } else {
                                    log(false, [repo.branch[current].name + " --> no rebase origin for this branch"]);
                                    repo.branch[current].status = STATUS.UNCHECKED;
                                    checkEachBranch(repo, current + 1, done);
                                }
                            });
                        });
                    });
                }
            } else {
                log(false, [err]);
                checkEachBranch(repo, current + 1, done);
            }
        });
    } else {
        done();
    }
};

// create "server" config from JSON
var createConfig = function(json, current) {
    if (current < json.length) {
        fs.mkdir(__dirname + "/repos", function(err) {
            var repo = json[current];
            var repoUrl = repo.url.replace(".git", "").split("/");

            repo.name = repoUrl.pop();
            repo.owner = repoUrl.pop();

            fs.exists("repos/" + repo.name, function(exist) {
                if (!exist) {
                    log(true, ["clone repository " + repo.name + " ongoing..."]);
                    log(true, ["This can take a short or very long time, depends of your repos size"]);
                    gitCloneRepo("repos/", repo.url, function(err) {
                        //if (err) log("skip to the next repo", err);
                        createConfig(json, current + 1);
                    });
                } else {
                    log(true, [repo.name + " already exist, skip to the next repo"]);
                    abortRebaseIfNeeded("repos/" + repo.name, function() {
                        createConfig(json, current + 1);
                    });
                }
            });
        });
    } else {
        config = json;
        startProcess();
    }
};

// interface ask a rebase on branch, look for it and active rebase if find it
var askRebase = function(data) {
    ask("rebase", data.from, data.on);
};

// interface ask a recover on branch, look for it and active recover if find it
var askRecover = function(data) {
    ask("recover", data.from, data.on);
};

var ask = function(asking, from, on) {
    config.forEach(function(project, indexP) {
        if (project.name === from) {
            project.branch.forEach(function(branch, indexB) {
                if (branch.name.replace(".", "") === on) {
                    log(true, ["--> Ask " + asking + " for", branch.name, "on", new Date()]);
                    config[indexP].branch[indexB][asking] = true;
                }
            });
        }
    });
};

// clone a repo
var gitCloneRepo = function(path, url, done) {
    var sshUrl = url.replace("https://github.com/", "git@github.com:");
    log(true, ["git clone ongoing on", sshUrl, "please wait"]);
    exec(path, "git clone " + sshUrl, function(err, stdout, stderr) {
        log(true, ["git clone finish on", sshUrl, err || ""]);
        done(err);
    });
};

// abort an ongoing rebase when server was killed
var abortRebaseIfNeeded = function(path, done) {
    exec(path, "git rebase --abort", function(err, stdout, stderr) {
        done(err);
    });
};

// get rebase origin for a branch from rules defined on config.json
var getRebaseOrigin = function(repo, branchName, done) {
    var rebaseOrigin = null;
    repo.rebase.forEach(function(rules, index) {
        var re = new RegExp(rules.to, "ig");
        if (re.test(branchName)) {
            rebaseOrigin = rules.from;
        }
    });
    done(rebaseOrigin);
};

var getMissingCommits = function(repo, currentBranch, rebaseOrigin) {
    exec("repos/" + repo.name, "git cherry origin/"+ repo.branch[currentBranch].name + " origin/" + rebaseOrigin, function(err, stdout, stderr) {
        if (!err) {
            var match = stdout.match(/\+/g);
            if (match) {
                repo.branch[currentBranch].missCommit = stdout.match(/\+/g).length;
            } else {
                repo.branch[currentBranch].missCommit = 0;
            }
        }
    });
}

//update branch list from remote project, and keep previous status
var updateBranchList = function(done) {
    config.updatedBranch = 0;
    config.forEach(function(repo, index) {
        exec("repos/" + repo.name, "git remote update --prune", function(err) {
            if (!err) {
                exec("repos/" + repo.name, "git branch -r", function(err, stdout, stderr) {
                    if (!err && stdout) {
                        var aBranch = stdout.replace(/\s+origin\/HEAD.+/g, "").split("\n");
                        for (i = 0; i < aBranch.length; ++i) {
                            if (aBranch[i] === "") {
                                aBranch.splice(i--, 1);
                            } else {
                                aBranch[i] = aBranch[i].split("/")[1];
                            }
                        }

                        var old = [];
                        if (config[index].branch) {
                            old = config[index].branch.slice();
                        }

                        config[index].branch = [];
                        aBranch.forEach(function(branchName, i) {
                            var newBranch = {name: branchName, status: STATUS.UNCHECKED, parent: "", lastCommit: "", backup: ""};
                            old.forEach(function(oldBranch) {
                                if (oldBranch.name === branchName) {
                                    newBranch = oldBranch;
                                }
                            });
                            config[index].branch.push(newBranch);
                        });

                        config.updatedBranch++;
                    }

                    //check if we have branch for all repo
                    if (config.updatedBranch === config.length) {
                        done(err);
                    }
                });
            }
        });
    });
};

var updateBackup = function(done) {
    readBackup(function(backup) {
        config.forEach(function(repo, indexR) {
            if (!backup[repo.url]) {
                backup[repo.url] = {};
            } else {
                repo.branch.forEach(function(branch, indexB) {
                    if (backup[repo.url][branch.name]) {
                        config[indexR].branch[indexB].backup = backup[repo.url][branch.name];
                    }
                });
            }
        });
        writeBackup(backup, done);
    });
}

var readBackup = function(done) {
    //TODO maybe check if backup branch contained in backup.json realy exist on local repo
    var backupFile = __dirname + "/repos/backup.json";
    if (config.backup) {
        done(config.backup);
    } else {
        fs.readFile(backupFile, function(err, data) {
            if (!err) {
                config.backup = JSON.parse(data);
                done(config.backup);
            } else {
                fs.appendFile(backupFile, {}, function(err) {
                    if (!err) {
                        config.backup = {};
                        done(config.backup);
                    }
                });
            }
        });
    }
}

var writeBackup = function(backup, done) {
    fs.writeFile(__dirname + "/repos/backup.json", JSON.stringify(backup), function(err) {
        if (!err && done) {
            done();
        }
    });
}

// little helpers
String.prototype.endsWith = function(suffix) {
    return this.indexOf(suffix, this.length - suffix.length) !== -1;
};

var exec = function(localPath, command, done) {
    cp.exec("cd " + __dirname + "/" + localPath + " && " + command, function(error, stdout, stderr) {
        if (error && error !== "") {
            log(false, ["#########################"]);
            log(false, ["Exec command: ", command]);
            log(false, ["Exec path: ", localPath]);
            log(false, ["Exec stderr: ", error]);
        }
        done(error, stdout, stderr);
    });
}

var log = function(consoleLog, args) {
    if (consoleLog) {
        console.log.apply(console, args);
    }
    print.apply(this, args);
}

var print = function() {
    var args = Array.prototype.slice.call(arguments);
    fs.appendFileSync("/tmp/grebase.log", "\r\n");
    fs.appendFileSync("/tmp/grebase.log", args.join(" "));
}

init();
serverIo.listen(process.env.PORT || 8080);
log(true, ["now listening on port ", (process.env.PORT || 8080)]);
