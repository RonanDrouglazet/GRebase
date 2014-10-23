var fs = require("fs");
var express = require("express");

exports.middleware = function() {
    return express.static("/tmp/");
}

exports.log = function(doConsoleLog, args) {
    if (doConsoleLog) {
        console.log.apply(console, args);
    }
    exports.print.apply(this, args);
}

exports.print = function() {
    var args = Array.prototype.slice.call(arguments);
    fs.appendFileSync("/tmp/grebase.log", "\r\n");
    fs.appendFileSync("/tmp/grebase.log", new Date().toLocaleString() + " ");
    fs.appendFileSync("/tmp/grebase.log", args.join(" "));
}
