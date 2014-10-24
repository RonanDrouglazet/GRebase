var fs = require("fs");
var express = require("express");

var lastReset, resetTimer_h = 24;

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
    if (arguments) {
        resetFileIfNeeded();
        var args = Array.prototype.slice.call(arguments);
        fs.appendFileSync("/tmp/grebase.log", "\r\n");
        fs.appendFileSync("/tmp/grebase.log", new Date().toLocaleString() + " ");
        fs.appendFileSync("/tmp/grebase.log", args.join(" "));
    }
}

var resetFileIfNeeded = function() {
    var timeToWait_ms = resetTimer_h * 60 * 60 * 1000;
    var now = Date.now();

    if (!lastReset) {
        lastReset = now;
    } else if ((lastReset + timeToWait_ms) < now) {
        fs.writeFileSync("/tmp/grebase.log", "");
        lastReset = now;
    }
}
