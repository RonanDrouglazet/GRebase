var appId = require("../config.json").GitHub_API,
https = require('https'),
querystring = require('querystring');

/*
 * @method oauth get oauth token from GitHubAPI
 *
 */
exports.oauth = function(req, res, done) {
    if (!req.signedCookies.git_access_token && !req.param("code")) {
        res.redirect("https://github.com/login/oauth/authorize?redirect_uri=" + appId.client_redirect + req.path + "&scope=repo&client_id=" + appId.client_id + "&state=" + Date.now());
    } else if (req.param("code")) {
        sendResponseToGitHub(req, res, done);
    } else if (req.signedCookies.git_access_token) {
        done(req.signedCookies.git_access_token);
    }
}

exports.getAllBranch = function(accessToken, owner, repo, done) {
    exports.gitHubApiRequest(accessToken, "GET", "/repos/" + owner + "/" + repo + "/branches", null, done);
}

exports.getBranch = function(accessToken, owner, repo, branch, done) {
    exports.gitHubApiRequest(accessToken, "GET", "/repos/" + owner + "/" + repo + "/branches/" + branch, null, done);
}

exports.getCommit = function(accessToken, owner, repo, sha, done) {
    exports.gitHubApiRequest(accessToken, "GET", "/repos/" + owner + "/" + repo + "/commits/" + sha, null, done);
}

/*
 * @method gitHubApiRequest create https request for github api
 *
 */
exports.gitHubApiRequest = function(accessToken, method, path, params, done) {
    var dataObject = "", options = {
      headers: {"User-Agent": "BackNode", "Authorization": "token " + accessToken},
      hostname: 'api.github.com',
      port: 443,
      path: path,
      method: method
    };

    var r = https.request(options, function(res) {
        res.on('data', function (chunk) {
            dataObject += chunk.toString();
        });

        res.on('end', function() {
            dataObject = JSON.parse(dataObject);
            done(null, dataObject);
        });
    });

    r.on('error', function(error) {
        console.log(error);
        done(error, null);
    });

    if (params) {
        r.write(JSON.stringify(params));
    }

    r.end();
}

// see to merge this function with exports.gitHubApiRequest
var sendResponseToGitHub = function(req, res, done) {
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
