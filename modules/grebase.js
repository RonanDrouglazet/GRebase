var cookieSession = require('cookie-session'),
cookieParser = require('cookie-parser'),
jsonConfig = require("../config.json"),
gitApi = require("./gitApi.js"),
gitCli = require("./gitCli.js"),
fs = require("fs");

var config, sIo;
var STATUS = {
    UNCHECKED: 1,
    UP_TO_DATE: 2,
    NEED_REBASE: 3,
    REBASE_FAILED: 4,
    ONGOING: 5
};

exports.middleware = function(app, socketIo, express) {

    // git oauth
    app.use(cookieParser('GRebaseGit'));
    app.use(cookieSession({ secret: 'GRebaseGit'}));
    app.get("/getToken/:repoId", getToken);

    // ask api
    app.get("/ask/:type/:branch/:repo", ask);

    // static
    app.use("/", express.static(__dirname + "/../static/"));

    // TODO REMOVE SOCKET.IO DONT NEDDED ANYMORE
    // socket io event for web interface
    sIo = socketIo;
    sIo.on("connection", function(socket) {
        socket.emit("update", config);
    });

    genConfig(jsonConfig);

    return function(req, res, next) {
        next();
    };
};

var genConfig = function(json) {
    config = JSON.parse(JSON.stringify(json)); // clone object
    config.repository.forEach(function(repo, index) {
        var repoUrl = repo.url.replace(".git", "").split("/");

        config.repository[index].name = repoUrl.pop();
        config.repository[index].owner = repoUrl.pop();
        config.repository[index].id = index;

        if (repo.token) {
            startWatching(index);
        }
    });
};

var startWatching = function(repoIndex) {
    cloneRepo(config.repository[repoIndex], function() {
        updateBranchList(config.repository[repoIndex], function(branchList) {
            updateBackup(config.repository[repoIndex], function() {
                updateInterface();
                var aBranch = [];
                branchList.forEach(function(branch, index) {
                    aBranch.push(index);
                });
                updateBranchStatus(repoIndex, aBranch, 0, function() {
                    console.log("TOUT BON");
                });
            });
        });
    });
};

var getToken = function(req, res) {
    var id = parseInt(req.param("repoId"));
    gitApi.oauth(req, res, function(token) {
        jsonConfig.repository[id].token = config.repository[id].token = token;
        fs.writeFileSync("config.json", JSON.stringify(jsonConfig));
        res.write("<script>window.close()</script>");
        res.send();
        updateInterface();
    });
};

var cloneRepo = function(repo, done) {
    fs.mkdir(__dirname + "/../repos", function(err) {
        fs.exists(__dirname + "/../repos/" + repo.name, function(exist) {
            if (!exist) {
                console.log("clone repository " + repo.name + " ongoing...");
                console.log("This can take a short or very long time, depends of your repos size");
                var url = repo.url.replace(/https:\/\/.*github/g, "https://" + repo.token + "@github");
                gitCli.clone(url, function() {
                    console.log("git clone finish on", url);
                    done();
                });
            } else {
                console.log(repo.name + " already exist, skip to the next repo");
                // abort an ongoing rebase when server was killed
                gitCli.abortRebase(repo.name, function() {
                    done();
                });
            }
        });
    });
};

//update branch list from remote project, and keep previous status
var updateBranchList = function(repo, done) {
    gitApi.getAllBranch(repo.token, repo.owner, repo.name, function(error, branchList) {
        if (!error && branchList) {
            var old = [];
            if (repo.branch) {
                old = repo.branch.slice();
            }

            repo.branch = [];

            branchList.forEach(function(branch, index) {
                repo.branch.push(checkIfBranchExist(branch, old));
            });

            done(repo.branch);
        } else {
            console.log(error);
            done(repo.branch);
        }
    });
};

var checkIfBranchExist = function(newBranch, oldBranchArray) {
    var branch = null;
    oldBranchArray.forEach(function(oldBranch) {
        if (oldBranch.name === newBranch.name) {
            oldBranch.sha = newBranch.sha;
            branch = oldBranch;
        }
    });

    if (!branch) {
        branch = createBranchObject(newBranch.name, newBranch.commit.sha);
    }

    return branch;
};

var createBranchObject = function(branchName, sha) {
    return {
        name: branchName,
        status: STATUS.UNCHECKED,
        parent: "",
        sha: sha,
        lastCommit: "",
        backup: "",
        rebase: {
            allow: false,
            token: null
        },
        merge: {
            allow: false,
            token: null
        },
        recover: {
            token: null
        }
    };
};

var updateBranchStatus = function(repoIndex, aBranchIndex, current, done) {
    if (current < aBranchIndex.length) {
        var next = updateBranchStatus.bind(this, repoIndex, aBranchIndex, current + 1, done);
        var repo = config.repository[repoIndex];
        var branch = repo.branch[aBranchIndex[current]];
        branch.status = STATUS.ONGOING;
        updateInterface();

        // get the rebase origin from config rules for this branch
        getRebaseOrigin(repo, branch.name, function(rebaseOrigin) {
            if (rebaseOrigin) {
                branch.parent = rebaseOrigin;
                // checkout on branch
                gitCli.checkout(repo.name, branch.name, function() {
                    // if a recover asked on this branch, reset it from backup and push on origin
                    if (branch.recover.token) {
                        gitCli.recover(repo, branch.name, branch.recover.token, function() {
                            branch.status = STATUS.UNCHECKED;
                            branch.recover.token = null;
                            // re check the current branch after the recover
                            updateBranchStatus(repoIndex, aBranchIndex, current, done);
                        });
                    } else {
                        gitCli.reset(repo.name, branch.name, function() {
                            gitCli.pull(repo.name, function() {
                                gitApi.getCommit(repo.token, repo.owner, repo.name, branch.sha, function(error, data) {
                                    branch.lastCommit = data.commit.author.email;
                                    // get number of missing commits
                                    gitCli.getMissingCommits(repo.name, branch.name, rebaseOrigin, function(missingCommits) {
                                        branch.missCommit = missingCommits;

                                        gitCli.merge(repo.name, rebaseOrigin, function(error, upToDate) {
                                            if (error) {
                                                branch.status = STATUS.REBASE_FAILED;
                                                branch.merge.allow = branch.rebase.allow = false;
                                                gitCli.reset(repo.name, branch.name, function() {
                                                    next();
                                                });
                                            } else {
                                                if (upToDate) {
                                                    branch.status = STATUS.UP_TO_DATE;
                                                    branch.merge.allow = branch.rebase.allow = false;
                                                    next();
                                                } else {
                                                    branch.status = STATUS.NEED_REBASE;
                                                    branch.merge.allow = true;

                                                    // if we want a merge, so do it and push
                                                    if (branch.merge.token) {
                                                        mergeAndPush(repo, branch.name, rebaseOrigin, branch.merge.token, function() {
                                                            branch.status = STATUS.UP_TO_DATE;
                                                            branch.backup = config.backup[repo.url][branch.name] = new Date().toLocaleString();
                                                            writeBackup(config.backup);
                                                            branch.merge.token = null;
                                                            next();
                                                        });
                                                    } else {
                                                        // else try to rebase to know if allow or not
                                                        gitCli.reset(repo.name, branch.name, function() {
                                                            gitCli.rebase(repo.name, rebaseOrigin, function(error, upToDate) {
                                                                branch.rebase.allow = !error;

                                                                if (!error && branch.rebase.token) {
                                                                    rebaseAndPush(repo, branch.name, rebaseOrigin, branch.rebase.token, function() {
                                                                        branch.status = STATUS.UP_TO_DATE;
                                                                        branch.backup = config.backup[repo.url][branch.name] = new Date().toLocaleString();
                                                                        writeBackup(config.backup);
                                                                        branch.rebase.token = null;
                                                                        next();
                                                                    });
                                                                } else {
                                                                    next();
                                                                }
                                                            });
                                                        });
                                                    }
                                                }
                                            }
                                        });
                                    });
                                });
                            });
                        });
                    }
                });
            } else {
                branch.status = STATUS.UNCHECKED;
                next();
            }
        });
    } else {
        done();
    }
};

var updateBackup = function(repo, done) {
    readBackup(function(backup) {
        if (!backup[repo.url]) {
            backup[repo.url] = {};
        } else {
            repo.branch.forEach(function(branch, indexB) {
                if (backup[repo.url][branch.name]) {
                    repo.branch[indexB].backup = backup[repo.url][branch.name];
                }
            });
        }
        writeBackup(backup, done);
    });
};

var readBackup = function(done) {
    //TODO maybe check if backup branch contained in backup.json realy exist on local repo
    var backupFile = __dirname + "/../repos/backup.json";
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
                    } else {
                        console.log(err);
                    }
                });
            }
        });
    }
};

var writeBackup = function(backup, done) {
    fs.writeFile(__dirname + "/../repos/backup.json", JSON.stringify(backup), function(err) {
        if (!err && done) {
            done();
        } else {
            console.log(err);
        }
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

var rebaseAndPush = function(repo, branchName, rebaseOrigin, tokenToPush, done) {
    //create a backup branch and push -f
    gitCli.reset(repo.name, branchName, function() {
        gitCli.branch(repo.name, branchName + "_backup", function() {
            gitCli.checkout(repo.name, branchName, function() {
                gitCli.rebase(repo.name, rebaseOrigin, function(error, upToDate) {
                    if (!error) {
                        gitCli.push(tokenToPush, repo.name, repo.url, branchName, done);
                    }
                });
            });
        });
    });
};

var mergeAndPush = function(repo, branchName, rebaseOrigin, tokenToPush, done) {
    //create a backup branch and push -f
    gitCli.reset(repo.name, branchName, function() {
        gitCli.branch(repo.name, branchName + "_backup", function() {
            gitCli.checkout(repo.name, branchName, function() {
                gitCli.merge(repo.name, rebaseOrigin, function(error, upToDate) {
                    if (!error) {
                        gitCli.push(tokenToPush, repo.name, repo.url, branchName, done);
                    }
                });
            });
        });
    });
};

var ask = function(req, res) {
    gitApi.oauth(req, res, function(token) {
        var repoIndex = getIndexFromName(config.repository, req.param("repo"));
        var branchIndex = getIndexFromName(config.repository[repoIndex].branch, req.param("branch"));
        var branch = config.repository[repoIndex].branch[branchIndex];
        branch[req.param("type")].token = token; // active action by filling token to push

        updateBranchStatus(repoIndex, [branchIndex], 0, function() {
            updateInterface();
        });

        res.write("<script>window.close()</script>");
        res.send();
    });
};

var getIndexFromName = function(cArray, name) {
    var i = null;
    cArray.forEach(function(el, index) {
        if (el.name === name) {
            i = index;
        }
    });
    return i;
}

var updateInterface = function() {
    sIo.sockets.emit("update", config);
};