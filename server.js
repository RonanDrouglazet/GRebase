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

//404 not found
.use(function(req, res, next) {
    res.setHeader("Content-Type", "text/plain");
    res.send(404, "Not Found");
});

//socket io event for web interface
socketIo.on("connection", function(socket) {
    socket.on("rebase", askRebase);
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
    fs.readFile("config.json", function(err, data) {
        if (!err) {
            createConfig(JSON.parse(data), 0);
        } else {
            console.error("GReabase error: please put config.json on GRebase root directory");
        }
    });
};

// update branch list for each project before begin to check
var startProcess = function() {
    updateBranchList(function(err) {
        if (!err) {
            checkEachProject(0);
        } else {
            console.error(err);
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
                // reset and pull
                exec("repos/" + repo.name, "git reset --hard origin/" + repo.branch[current].name + " && git pull --rebase", function(err, stdout, stderr) {
                    //get last commit author
                    exec("repos/" + repo.name, "git --no-pager show -s --format='%an <%ae>' HEAD", function(err, stdout, stderr) {
                        repo.branch[current].lastCommit = stdout;

                        // get the rebase origin from config rules for this branch
                        getRebaseOrigin(repo, repo.branch[current].name, function(rebaseOrigin) {
                            if (rebaseOrigin) {
                                repo.branch[current].parent = rebaseOrigin;

                                // try to rebase from origin
                                exec("repos/" + repo.name, "git rebase origin/" + rebaseOrigin, function(err, stdout, stderr) {
                                    if (err) {
                                        console.log("REBASE AUTO FAILED FOR " + repo.branch[current].name);
                                        repo.branch[current].status = STATUS.REBASE_FAILED;
                                        exec("repos/" + repo.name, "git rebase --abort", function(err, stdout, stderr) {
                                            checkEachBranch(repo, current + 1, done);
                                        });
                                    } else {
                                        if (stdout.endsWith("is up to date.\n")) {
                                            console.log("UP TO DATE " + repo.branch[current].name);
                                            repo.branch[current].status = STATUS.UP_TO_DATE;
                                            checkEachBranch(repo, current + 1, done);
                                        } else {
                                            console.log("REBASE NEEDED FOR " + repo.branch[current].name);
                                            repo.branch[current].status = STATUS.NEED_REBASE;

                                            if (repo.branch[current].rebase) {
                                                repo.branch[current].rebase = false;
                                                //create a backup branch and push -f
                                                exec("repos/" + repo.name, "git reset --hard origin/" + repo.branch[current].name +
                                                    " && git branch -f " + repo.branch[current].name + "_backup && git rebase origin/" + rebaseOrigin +
                                                    " && git push -f", function(err, stdout, stderr) {
                                                    if (!err) {
                                                        repo.branch[current].status = STATUS.UP_TO_DATE;
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
                                console.log(repo.branch[current].name + " --> no rebase origin for this branch");
                                repo.branch[current].status = STATUS.UNCHECKED;
                                checkEachBranch(repo, current + 1, done);
                            }
                        });
                    });
                });
            } else {
                console.log(err);
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
        fs.mkdir("repos", function(err) {
            var repo = json[current];
            var repoUrl = repo.url.replace(".git", "").split("/");

            repo.name = repoUrl.pop();
            repo.owner = repoUrl.pop();

            fs.exists("repos/" + repo.name, function(exist) {
                if (!exist) {
                    console.log("clone repository " + repo.name + " ongoing...");
                    console.log("This can take a short or very long time, depends of your repos size");
                    gitCloneRepo("repos/", repo.url, function(err) {
                        if (err) console.error("skip to the next repo", err);
                        createConfig(json, current + 1);
                    });
                } else {
                    console.warn(repo.name + " already exist, skip to the next repo");
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
    config.forEach(function(project, indexP) {
        if (project.name === data.from) {
            project.branch.forEach(function(branch, indexB) {
                if (branch.name.replace(".", "") === data.on) {
                    console.log("--> Ask rebase for", branch.name);
                    config[indexP].branch[indexB].rebase = true;
                }
            });
        }
    });
};

// clone a repo
var gitCloneRepo = function(path, url, done) {
    exec(path, "git clone " + url, function(err, stdout, stderr) {
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

//update branch list from remote project, and keep previous status
var updateBranchList = function(done) {
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
                            var newBranch = {name: branchName, status: STATUS.UNCHECKED, parent: "", lastCommit: ""};
                            old.forEach(function(oldBranch) {
                                if (oldBranch.name === branchName) {
                                    newBranch = oldBranch;
                                }
                            });
                            config[index].branch.push(newBranch);
                        });
                    }
                    if (index === config.length - 1) {
                        done(err);
                    }
                });
            }
        });
    });
};

// little helpers
String.prototype.endsWith = function(suffix) {
    return this.indexOf(suffix, this.length - suffix.length) !== -1;
};

var exec = function(localPath, command, done) {
    //console.log("#########################");
    //console.log("Exec command: ", command);
    //console.log("Exec path: ", localPath);

    cp.exec("cd " + localPath + " && " + command, function(error, stdout, stderr) {
        if (stdout && stdout !== "") {
            //console.log("Exec stdout: ", stdout);
        }
        if (stderr && stderr !== "") {
            //console.log("Exec stderr: ", stderr);
        }
        done(error, stdout, stderr);
    });
}


init();
serverIo.listen(process.env.PORT || 8080);
console.info("now listening on port ", (process.env.PORT || 8080));
