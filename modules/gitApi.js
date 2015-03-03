var appId = require("../config.json").GitHub_API,
https = require('https'),
querystring = require('querystring'),
logger = require("./logger.js"),
eventHandlers = {},
pollOngoing = {reposIndex: [], repos: [], current: null, time: null};

// GitApi event (https://developer.github.com/v3/activity/events/types/)
exports.EVENTS = {
   COMMIT_COMMENT: "CommitCommentEvent",
   CREATE: "CreateEvent",
   DELETE: "DeleteEvent",
   DEPLOY: "DeploymentEvent",
   DEPLOY_STATUS: "DeploymentStatusEvent",
   DOWNLOAD: "DownloadEvent",
   FOLLOW: "FollowEvent",
   FORK: "ForkEvent",
   FORK_APPLY: "ForkApplyEvent",
   GIST: "GistEvent",
   GOLLUM: "GollumEvent",
   ISSUE_COMMENT: "IssueCommentEvent",
   ISSUES: "IssuesEvent",
   MEMBER: "MemberEvent",
   PAGE_BUILD: "PageBuildEvent",
   PUBLIC: "PublicEvent",
   PULL_REQUEST: "PullRequestEvent",
   PULL_REQUEST_REVIEWED: "PullRequestReviewCommentEvent",
   PUSH: "PushEvent",
   RELEASE: "ReleaseEvent",
   STATUS: "StatusEvent",
   TEAM_ADD: "TeamAddEvent",
   WATCH: "WatchEvent"
}

/*
 * @method oauth get oauth token from GitHubAPI
 *
 */
exports.oauth = function(req, res, done) {
    if (!req.signedCookies.git_access_token && !req.param("code")) {
        res.redirect("https://github.com/login/oauth/authorize?redirect_uri=" + appId.client_redirect + req.path + "&scope=repo&client_id=" + appId.client_id + "&state=" + Date.now());
    } else if (req.param("code")) {
        sendResponseForOAuth(req, res, done);
    } else if (req.signedCookies.git_access_token) {
        done(req.signedCookies.git_access_token);
    }
}

exports.getAllBranch = function(accessToken, owner, repo, done) {
    exports.gitHubApiRequest(accessToken, "GET", "/repos/" + owner + "/" + repo + "/branches", null, null, done);
}

exports.getBranch = function(accessToken, owner, repo, branch, done) {
    exports.gitHubApiRequest(accessToken, "GET", "/repos/" + owner + "/" + repo + "/branches/" + branch, null, null, done);
}

exports.getCommit = function(accessToken, owner, repo, sha, done) {
    exports.gitHubApiRequest(accessToken, "GET", "/repos/" + owner + "/" + repo + "/commits/" + sha, null, null, done);
}

exports.getUser = function(userToken, done) {
    exports.gitHubApiRequest(userToken, "GET", "/user", null, null, done);
}

exports.createIssueOnRepo = function(accessToken, owner, repo, title, body) {
    exports.doesIssueExist(accessToken, owner, repo, title, function(error, issue) {
        if (!error && !issue) {
            exports.gitHubApiRequest(accessToken, "POST", "/repos/" + owner + "/" + repo + "/issues", {title: title, body: body}, null, function() {});
        }
    });
}

exports.closeIssueOnRepo = function(accessToken, owner, repo, title) {
    exports.doesIssueExist(accessToken, owner, repo, title, function(error, issue) {
        if (!error && issue) {
            exports.gitHubApiRequest(accessToken, "PATCH", "/repos/" + owner + "/" + repo + "/issues/" + issue.number, {state: "closed"}, null, function() {});
        }
    });
}

exports.doesIssueExist = function(accessToken, owner, repo, title, done) {
    var issueFound = null;
    exports.gitHubApiRequest(accessToken, "GET", "/repos/" + owner + "/" + repo + "/issues", null, null, function(error, data, res) {
        if (!error && data && data.length) {
            data.forEach(function(issue, index) {
                if (issue.title === title) {
                    issueFound = issue;
                }
            });
            done(error, issueFound);
        } else {
            done(error, null);
        }
    });
}

exports.addEventOnRepo = function(accessToken, owner, repo, eventName, handler) {
    if (!eventHandlers[repo]) {
        eventHandlers[repo] = {};
    }
    if (!eventHandlers[repo][eventName]) {
        eventHandlers[repo][eventName] = [];
    }

    eventHandlers[repo][eventName].push(handler);

    var repoInfos = {a: accessToken, o: owner, r: repo, lei: null, etag: null};
    if (pollOngoing.reposIndex.indexOf(repoInfos.o + repoInfos.r) === -1) {
        console.log('add repo', repo, 'on list');
        pollOngoing.reposIndex.push(repoInfos.o + repoInfos.r);
        pollOngoing.repos.push(repoInfos);
    }

    if (pollOngoing.current === null) {
        console.log('start loop');
        pollOngoing.current = 0;
        loopPollForRepoEvent();
    }
}

var loopPollForRepoEvent = function() {
    var infos = pollOngoing.repos[pollOngoing.current];
    console.log('loopPollForRepoEvent', infos.r);
    exports.gitHubApiRequest(infos.a, "GET", "/repos/" + infos.o + "/" + infos.r + "/events", null, infos.etag, function(error, events, response) {
        if (!error) {
            var h = response.headers;
            var time =  parseInt(h["x-poll-interval"], 10);
            var ntag = h.etag;

            if (h.status === "200 OK") {
                var newEventId = events[0].id;
                if (infos.etag) {
                    while (events[0].id !== infos.lei) {
                        if (eventHandlers[infos.r][events[0].type]) {
                            console.log('dispatch event', events[0].type, 'for', infos.r);
                            eventHandlers[infos.r][events[0].type].forEach(function(callback, index) {
                                callback(events[0], events[0].type);
                            });
                        }
                        events.shift()
                    }
                }
                infos.lei = newEventId;
            }

            if (ntag) {
                infos.etag = {"If-None-Match": ntag};
            }

            if (pollOngoing.current === pollOngoing.repos.length - 1) {
                pollOngoing.current = 0;
            } else {
                pollOngoing.current++;
            }

            if (time) {
                pollOngoing.time = time;
            }
            console.log('next in', pollOngoing.time);
            setTimeout(loopPollForRepoEvent, pollOngoing.time * 1000);
        } else {
            // if error, retry it
            logger.log(true, ["loopPollForRepoEvent", error]);
            loopPollForRepoEvent();
        }
    });
}

/*
 * @method gitHubApiRequest create https request for github api
 *
 */
exports.gitHubApiRequest = function(accessToken, method, path, params, headers, done) {
    var dataObject = "", options = {
      headers: {"User-Agent": "GRebase", "Authorization": "token " + accessToken, "Content-Length": params ? JSON.stringify(params).length : 0},
      hostname: 'api.github.com',
      port: 443,
      path: path,
      method: method
    };

    if (headers) {
        for (var i in headers) {
            if (headers.hasOwnProperty(i)) {
                options.headers[i] = headers[i];
            }
        }
    }

    var r = https.request(options, function(res) {
        res.on('data', function (chunk) {
            dataObject += chunk.toString();
        });

        res.on('end', function() {
            try {
                dataObject = dataObject !== "" ? JSON.parse(dataObject) : null;
            } catch(e) {
                logger.log(true, [method, path, params]);
                logger.log(true, [dataObject]);
                logger.log(true, [e]);
            }

            done(null, dataObject, res);
        });
    });

    r.on('error', function(error) {
        logger.log(true, [method, path, params, error]);
        done(error, null, null);
    });

    if (params) {
        r.write(JSON.stringify(params));
    }

    r.end();
}

// see to merge this function with exports.gitHubApiRequest
var sendResponseForOAuth = function(req, res, done) {
    var access_token, dataObject, options = {
        hostname: "github.com",
        port: 443,
        path: "/login/oauth/access_token",
        method: "POST"
    };

    var gitResponse = https.request(options, function(resG) {
        resG.on("data", function (chunk) {
            dataObject = querystring.parse(chunk.toString());
            if (dataObject.access_token) {
                access_token = dataObject.access_token;
                res.cookie("git_access_token", access_token, {signed: true});
                done(access_token);
            }
        });
    });

    gitResponse.on("error", function(error) {
        logger.log(true, ["sendResponseForOAuth error", error]);
        res.write(error);
        res.send();
    });

    gitResponse.write("client_id=" + appId.client_id + "&client_secret=" + appId.client_secret + "&code=" + req.param("code"));
    gitResponse.end();
}
