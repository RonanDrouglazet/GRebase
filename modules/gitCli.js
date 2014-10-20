var cp = require("child_process");

exports.clone = function(url, done) {
    exports.exec("../repos/", "git clone " + url, function(err, stdout, stderr) {
        if (!err) {
            done();
        } else {
            console.log("clone error on", url, "(", repoName, ")");
            console.log(err);
        }
    });
};

exports.checkout = function(repoName, branchName, done) {
    exports.exec("../repos/" + repoName, "git fetch origin && git checkout " + branchName, function(err, stdout, stderr) {
        if (!err) {
            done();
        } else {
            console.log("checkout error on", branchName, "(", repoName, ")");
            console.log(err);
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
            console.log("recover error on", branchName, "(", repo.name, ")");
            console.log(err);
        }
    });
};

exports.reset = function(repoName, branchName, done) {
    exports.exec("../repos/" + repoName, "git reset --hard origin/" + branchName, function(err, stdout, stderr) {
        if (!err) {
            done();
        } else {
            console.log("reset error on", branchName, "(", repoName, ")");
            console.log(err);
        }
    });
};

exports.pull = function(repoName, done) {
    exports.exec("../repos/" + repoName, "git pull --rebase", function(err, stdout, stderr) {
        if (!err) {
            done();
        } else {
            console.log("pull error on", "(", repoName, ")");
            console.log(err);
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

exports.merge = function(repoName, branchToMerge, done) {
    exports.exec("../repos/" + repoName, "git merge --no-ff origin/" + branchToMerge, function(err, stdout, stderr) {
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
            console.log("branch error on", branchName, "(", repoName, ")");
            console.log(err);
        }
    });
};

exports.push = function(pushToken, repoName, repoUrl, branchName, done) {
    repoUrl = repoUrl.replace("https://", "https://" + pushToken + "@");
    exports.exec("../repos/" + repoName, "git push -f " + repoUrl + " " + branchName, function(err, stdout, stderr) {
        if (!err) {
            done();
        } else {
            console.log("push error on", branchName, "(", repoName, ") ", "with token: ", pushToken);
            console.log(err);
        }
    });
};

exports.abortRebase = function(repoName, done) {
    exports.exec("../repos/" + repoName, "git rebase --abort", function(err, stdout, stderr) {
        done(err);
    });
};

exports.getMissingCommits = function(repoName, branchName, rebaseOrigin, done) {
    exports.exec("../repos/" + repoName, "git cherry origin/"+ branchName + " origin/" + rebaseOrigin, function(err, stdout, stderr) {
        if (!err) {
            var match = stdout.match(/\+/g);
            done(match ? match.length : 0);
        } else {
            console.log("getMissingCommits error on", branchName, "(", repoName, ")");
            console.log(err);
        }
    });
};

// helper
exports.exec = function(localPath, command, done) {
    cp.exec("cd " + __dirname + "/" + localPath + " && " + command, function(error, stdout, stderr) {
        //if (error && error !== "") {
            console.log("#########################");
            console.log("Exec command: ", command);
            console.log("Exec path: ", localPath);
            console.log("Exec stderr: ", error);
            console.log("Exec stdout: ", stdout);
        //}
        done(error, stdout, stderr);
    });
};

String.prototype.endsWith = function(suffix) {
    return this.indexOf(suffix, this.length - suffix.length) !== -1;
};
