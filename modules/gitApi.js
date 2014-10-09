var appId = require("../config.json").GitHub_API,
https = require('https'),
querystring = require('querystring'),
eventHandlers = {},
pollOngoing = {};

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

exports.addEventOnRepo = function(accessToken, owner, repo, eventName, handler) {
    if (!eventHandlers[repo]) {
        eventHandlers[repo] = {};
    }
    if (!eventHandlers[repo][eventName]) {
        eventHandlers[repo][eventName] = [];
    }

    eventHandlers[repo][eventName].push(handler);

    if (!pollOngoing[repo]) {
        pollOngoing[repo] = true;
        loopPollForRepoEvent(accessToken, owner, repo);
    }
}

var loopPollForRepoEvent = function(accessToken, owner, repo) {
    var etag = null;
    var lastEventId = null;

    var pollRequest = function() {
        exports.gitHubApiRequest(accessToken, "GET", "/repos/" + owner + "/" + repo + "/events", null, etag, function(error, events, response) {
            var h = response.headers;
            var time =  parseInt(h["x-poll-interval"], 10);
            var ntag = h.etag;

            if (h.status === "200 OK") {
                var newEventId = events[0].id;
                if (etag) {
                    while (events[0].id !== lastEventId) {
                        if (eventHandlers[repo][events[0].type]) {
                            eventHandlers[repo][events[0].type].forEach(function(callback, index) {
                                callback(events[0]);
                            });
                        }
                        events.shift()
                    }
                }
                lastEventId = newEventId;
            }

            if (ntag) {
                etag = {"If-None-Match": ntag};
            }

            setTimeout(pollRequest, time * 1000);
        });
    }

    pollRequest();
}

/*
 * @method gitHubApiRequest create https request for github api
 *
 */
exports.gitHubApiRequest = function(accessToken, method, path, params, headers, done) {
    var dataObject = "", options = {
      headers: {"User-Agent": "BackNode", "Authorization": "token " + accessToken},
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
            dataObject = dataObject !== "" ? JSON.parse(dataObject) : null;
            done(null, dataObject, res);
        });
    });

    r.on('error', function(error) {
        console.log(error);
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
        console.log(error);
        res.write(error);
        res.send();
    });

    gitResponse.write("client_id=" + appId.client_id + "&client_secret=" + appId.client_secret + "&code=" + req.param("code"));
    gitResponse.end();
}
