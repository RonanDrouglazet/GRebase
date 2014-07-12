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

var init = function() {
    fs.readFile("config.json", function(err, data) {
        if (!err) {
            createConfig(JSON.parse(data), 0);
        } else {
            console.error("GReabase error: please put config.json on GRebase root directory");
        }
    });
};

var startProcess = function() {
    updateBranchList(function(err) {
        if (!err) {
            checkEachProject(0);
        } else {
            console.error(err);
        }
    });
};

var checkEachProject = function(current) {
    if (current < config.length) {
        checkEachBranch(config[current], 0, function() {
            checkEachProject(current + 1);
        });
    } else {
        startProcess();
    }
};

var checkEachBranch = function(repo, current, done) {
    if (current < repo.branch.length) {
        repo.branch[current].status = STATUS.ONGOING;
        socketIo.sockets.emit("update", config);
        exec("repos/" + repo.name, "git checkout " + repo.branch[current].name, function(err, stdout, stderr) {
            if (!err) {
                getRebaseOrigin(repo, repo.branch[current].name, function(rebaseOrigin) {
                    if (rebaseOrigin) {
                        exec("repos/" + repo.name, "git pull --rebase && git reset --hard origin/" + repo.branch[current].name + " && git rebase origin/" + rebaseOrigin, function(err, stdout, stderr) {
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
                                } else {
                                    console.log("REBASE NEEDED FOR " + repo.branch[current].name);
                                    repo.branch[current].status = STATUS.NEED_REBASE;
                                }
                                checkEachBranch(repo, current + 1, done);
                            }
                        });
                    } else {
                        console.log(repo.branch[current].name + " --> no rebase origin for this branch");
                        repo.branch[current].status = STATUS.UNCHECKED;
                        checkEachBranch(repo, current + 1, done);
                    }
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
                    createConfig(json, current + 1);
                }
            });
        });
    } else {
        config = json;
        startProcess();
    }
};

var gitCloneRepo = function(path, url, done) {
    exec(path, "git clone " + url, function(err, stdout, stderr) {
        done(err);
    });
};

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

var updateBranchList = function(done) {
    config.forEach(function(repo, index) {
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
                    var status = STATUS.UNCHECKED;
                    old.forEach(function(oldBranch) {
                        if (oldBranch.name === branchName) {
                            status = oldBranch.status;
                        }
                    });
                    config[index].branch.push({name: branchName, status: status});
                });
            }
            if (index === config.length - 1) {
                done(err);
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
