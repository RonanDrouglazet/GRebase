var express = require("express"),
io = require("socket.io"),
http = require("http"),
grebase = require("./modules/grebase.js");

var app = express();
var serverIo = http.createServer(app);
var socketIo = io.listen(serverIo);

// GRebase
app.use(grebase.middleware(app, socketIo, express))

// 404 not found
.use(function(req, res, next) {
    res.setHeader("Content-Type", "text/plain");
    res.send(404, "Not Found");
});

serverIo.listen(process.env.PORT || 8080);
console.log("now listening on port ", (process.env.PORT || 8080));
