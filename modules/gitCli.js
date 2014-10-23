var cp = require("child_process"),
logger = require("./logger.js");

exports.clone = function(url, done) {
    exports.exec("../repos/", "git clone " + url, function(err, stdout, stderr) {
        if (!err) {
            done();
        } else {
            logger.log(true, ["clone error on", url, "(", repoName, ")"]);
            logger.log(true, [err]);
        }
    });
};

exports.checkout = function(repoName, branchName, done, cleanAlreadyDone) {
    exports.exec("../repos/" + repoName, "git fetch origin && git checkout " + branchName, function(err, stdout, stderr) {
        if (!err) {
            done();
        } else if (!cleanAlreadyDone) {
            exports.clean(repoName, exports.checkout.bind(this, repoName, branchName, done, true));
        } else {
            logger.log(true, ["checkout error on", branchName, "(", repoName, ")"]);
            logger.log(true, [err]);
        }
    });
};

exports.recover = function(repo, branchName, pushToken, done) {
    repoUrl = repo.url.replace("https://", "https://" + pushToken + "@");
    exports.exec("../repos/" + repo.name, "git reset --hard " + branchName + "_backup" +
        " && git push -f " + repoUrl + " " + branchName, function(err, stdout, stderr) {
        if (!err) {
            done();
        } else {
            logger.log(true, ["recover error on", branchName, "(", repo.name, ")"]);
            logger.log(true, [err]);
        }
    });
};

exports.reset = function(repoName, branchName, done) {
    exports.exec("../repos/" + repoName, "git reset --hard" + (branchName ? (" origin/" + branchName) : ""), function(err, stdout, stderr) {
        if (!err) {
            done();
        } else {
            logger.log(true, ["reset error on", branchName, "(", repoName, ")"]);
            logger.log(true, [err]);
        }
    });
};

exports.pull = function(repoName, done) {
    exports.exec("../repos/" + repoName, "git pull --rebase", function(err, stdout, stderr) {
        if (!err) {
            done();
        } else {
            logger.log(true, ["pull error on", "(", repoName, ")"]);
            logger.log(true, [err]);
        }
    });
};

exports.rebase = function(repoName, rebaseOrigin, done) {
    exports.exec("../repos/" + repoName, "git rebase origin/" + rebaseOrigin, function(err, stdout, stderr) {
        if (stdout.endsWith("is up to date.\n")) {
            done(err, true);
        } else {
            done(err, false);
        }
    });
};

exports.merge = function(repoName, branchToMerge, done, msg) {
    exports.exec("../repos/" + repoName, "git merge --no-ff origin/" + branchToMerge + (msg ? (" -m '" + msg + "'") : ""), function(err, stdout, stderr) {
        if (stdout === "Already up-to-date.\n") {
            done(err, true);
        } else {
            done(err, false);
        }
    });
};

exports.branch = function(repoName, branchName, done) {
    exports.exec("../repos/" + repoName, "git branch -f " + branchName, function(err, stdout, stderr) {
        if (!err) {
            done();
        } else {
            logger.log(true, ["branch error on", branchName, "(", repoName, ")"]);
            logger.log(true, [err]);
        }
    });
};

exports.push = function(pushToken, repoName, repoUrl, branchName, done, force) {
    repoUrl = repoUrl.replace("https://", "https://" + pushToken + "@");
    exports.exec("../repos/" + repoName, "git push " + (force ? "-f " : "") + repoUrl + " " + branchName, function(err, stdout, stderr) {
        if (err) {
            logger.log(true, ["push error on", branchName, "(", repoName, ") ", "with token: ", pushToken]);
            logger.log(true, [err]);
        }
        done(err);
    });
};

exports.abortRebase = function(repoName, done) {
    exports.exec("../repos/" + repoName, "git rebase --abort", function(err, stdout, stderr) {
        done(err);
    });
};

exports.clean = function(repoName, done) {
    exports.exec("../repos/" + repoName, "git clean -f -d -x", function(err, stdout, stderr) {
        done(err);
    });
};

exports.getMissingCommits = function(repoName, branchName, rebaseOrigin, done) {
    exports.exec("../repos/" + repoName, "git cherry origin/"+ branchName + " origin/" + rebaseOrigin, function(err, stdout, stderr) {
        if (!err) {
            var match = stdout.match(/\+/g);
            done(match ? match.length : 0);
        } else {
            logger.log(true, ["getMissingCommits error on", branchName, "(", repoName, ")"]);
            logger.log(true, [err]);
        }
    });
};

exports.setGrebaseAuthor = function(repoName, done) {
    exports.exec("../repos/" + repoName, "git config user.name 'GRebase-' && git config user.email 'grebase.2014@gmail.com'", function(err, stdout, stderr) {
        done(err);
    });
};

// helper
exports.exec = function(localPath, command, done) {
    cp.exec("cd " + __dirname + "/" + localPath + " && " + command, function(error, stdout, stderr) {
        /*if (error && error !== "") {
            console.log("#########################");
            console.log("Exec command: ", command);
            console.log("Exec path: ", localPath);
            console.log("Exec stderr: ", error);
            console.log("Exec stdout: ", stdout);
        }*/
        done(error, stdout, stderr);
    });
};

String.prototype.endsWith = function(suffix) {
    return this.indexOf(suffix, this.length - suffix.length) !== -1;
};
