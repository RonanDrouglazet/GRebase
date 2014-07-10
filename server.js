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

/*
 * @method exec execute a bash command and log it
 *
 */
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

var gitCloneRepo = function(path, url, done) {
    exec(path, "git clone " + url, function(err, stdout, stderr) {
        done(err);
    });
}

var createConfig = function(config, current) {
    if (current < config.length) {
        fs.mkdir("repos", function(err) {
            var repo = config[current];
            var repoUrl = repo.url.replace(".git", "").split("/");

            repo.name = repoUrl.pop();
            repo.owner = repoUrl.pop();

            fs.exists("repos/" + repo.name, function(exist) {
                if (!exist) {
                    console.log("clone repository " + repo.name + " ongoing..");
                    gitCloneRepo("repos/", repo.url, function(err) {
                        if (err) console.error("skip to the next repo", err);
                        createConfig(config, current + 1);
                    });
                } else {
                    console.warn(repo.name + " already exist, skip to the next repo");
                    createConfig(config, current + 1);
                }
            });
        });
    } else {
        startProcess(config);
    }
}

var updateBranchList = function(config, done) {
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
                config[index].branch = aBranch;
            }
            if (index === config.length - 1) {
                done(err);
            }
        });
    });
}

var getRebaseOrigin = function(repo, branchName, done) {
    var rebaseOrigin = null;
    repo.rebase.forEach(function(rules, index) {
        var re = new RegExp(rules.to, "ig");
        if (re.test(branchName)) {
            rebaseOrigin = rules.from;
        }
    });
    done(rebaseOrigin);
}

var checkEachBranch = function(repo, current, done) {
    if (current < repo.branch.length) {
        exec("repos/" + repo.name, "git checkout " + repo.branch[current], function(err, stdout, stderr) {
            if (!err) {
                getRebaseOrigin(repo, repo.branch[current], function(rebaseOrigin) {
                    if (rebaseOrigin) {
                        exec("repos/" + repo.name, "git pull --rebase && git reset --hard origin/" + repo.branch[current] + " && git rebase origin/" + rebaseOrigin, function(err, stdout, stderr) {
                            if (err) {
                                console.log("MERGE FAILED FOR " + repo.branch[current]);
                                exec("repos/" + repo.name, "git rebase --abort", function(err, stdout, stderr) {
                                    checkEachBranch(repo, current + 1, done);
                                });
                            } else {
                                console.log("MERGE WARN/OK FOR " + repo.branch[current]);
                                checkEachBranch(repo, current + 1, done);
                            }
                        });
                    } else {
                        console.log(repo.branch[current] + " --> no rebase origin for this branch");
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
}

var checkEachProject = function(repos, current) {
    if (current < repos.length) {
        checkEachBranch(repos[current], 0, function() {
            checkEachProject(repos, current + 1);
        });
    } else {
        startProcess(repos);
    }
}

var startProcess = function(config) {
    updateBranchList(config, function(err) {
        if (!err) {
            checkEachProject(config, 0);
        } else {
            console.error(err);
        }
    });
}

var init = function() {
    fs.readFile("config.json", function(err, data) {
        if (!err) {
            createConfig(JSON.parse(data), 0);
        } else {
            console.error("GReabase error: please put config.json on GRebase root directory");
        }
    });
}

init();

serverIo.listen(process.env.PORT || 8080);
console.info("now listening on port ", (process.env.PORT || 8080));
