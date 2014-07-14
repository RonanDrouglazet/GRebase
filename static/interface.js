// branch status shared with server
var STATUS = {
    UNCHECKED: 1,
    UP_TO_DATE: 2,
    NEED_REBASE: 3,
    REBASE_FAILED: 4,
    ONGOING: 5
}

// update interface (branch..)
var updateUI = function(data) {
    data.forEach(function(oProject, index) {
        var nProject = document.getElementById(oProject.name);
        if (!nProject) {
            $(".main").append("<div id='" +
                oProject.name +
                "'><h2 class='sub-header' >" +
                oProject.name +
                "</h2><div class='table-responsive'><div class='success'></div><div class='warning'></div><div class='danger'></div><div class='default'></div></div></div>");
            $(".nav-sidebar").append("<li><a href='#" + oProject.name + "'>" + oProject.name + "</a></li>")
        }

        oProject.branch.forEach(function(oBranch, i) {
            nProject = document.getElementById(oProject.name);

            var branchClassName = oProject.name + "_" + oBranch.name.replace(".", "");
            var branchExist = document.getElementsByClassName(branchClassName).length;
            var classColor = chooseColor(oBranch.status);
            var container = (oBranch.status === STATUS.ONGOING) ? "ongoing" : oProject.name;

            oBranch.lastCommit = oBranch.lastCommit.replace("<", "(").replace(">", ")");

            if (nProject && !branchExist) {
                $("#" + container + " ." + classColor).append(
                    "<div class='branch " + branchClassName + "'>" +
                        "<span class='label label-" + classColor + "'>" + classColor.toUpperCase() + "</span><span>" + oBranch.name + ((oBranch.parent !== "") ?  " (" + oBranch.parent + ")" : "") + "</span>" +
                        "<span class='text-muted' style='float:right;font-size:11px'>" + oBranch.lastCommit + "</span>" +
                        (oBranch.status === STATUS.NEED_REBASE && !oBranch.rebase ? "<span class='glyphicon glyphicon-refresh' data-toggle='tooltip' data-placement='right' title='rebase the branch'></span>" : "") +
                    "</div>"
                );

                if (oBranch.status === STATUS.NEED_REBASE) {
                    $("." + branchClassName + " .glyphicon").tooltip();
                    $("." + branchClassName + " .glyphicon").click(askRebase);
                }
            } else if (nProject) {
                var branch = $("." + branchClassName).get(0);
                if (branch) {
                    var label = $("." + branchClassName + " span").get(0);
                    var branchName = $("." + branchClassName + " span").get(1);
                    var lastCommit = $("." + branchClassName + " span").get(2);
                    var rebaseButton = $("." + branchClassName + " span").get(3);

                    label.className = "label label-" + classColor;
                    label.innerHTML = classColor.toUpperCase();
                    branchName.innerHTML = oBranch.name;
                    lastCommit.innerHTML = oBranch.lastCommit;

                    if (oBranch.parent !== "") {
                        branchName.innerHTML += " (" + oBranch.parent + ")";
                    }

                    if (branch.parentNode.className !== classColor || branch.parentNode.parentNode.parentNode.id !== container) {
                        $("#" + container + " ." + classColor).append(branch);
                    }

                    if (!rebaseButton && oBranch.status === STATUS.NEED_REBASE && !oBranch.rebase) {
                        $(branch).append("<span class='glyphicon glyphicon-refresh' data-toggle='tooltip' data-placement='right' title='rebase the branch'></span>");
                        $("." + branchClassName + " .glyphicon").tooltip();
                        $("." + branchClassName + " .glyphicon").click(askRebase);
                    } else if (rebaseButton && oBranch.status !== STATUS.NEED_REBASE) {
                        $(rebaseButton).tooltip("destroy");
                        $(rebaseButton).remove();
                    }
                }
            }
        });
    });
}

var askRebase = function() {
    var targetProject = this.parentNode.parentNode.parentNode.parentNode.id;
    var targetBranch = this.parentNode.className.replace("branch ", "").replace(targetProject + "_", "");
    socket.emit("rebase", {on: targetBranch, from:targetProject});
    $(this).tooltip("destroy");
    $(this).remove();
}

// choose a color / container from branch status
var chooseColor = function(status) {
    var color;
    switch (status) {
        case STATUS.UNCHECKED:
        case STATUS.ONGOING:
            color = "default";
        break;

        case STATUS.UP_TO_DATE:
            color = "success";
        break;

        case STATUS.NEED_REBASE:
            color = "warning";
        break;

        case STATUS.REBASE_FAILED:
            color = "danger";
        break;
    }
    return color;
}

//filter branch with input
$(".form-control").on("input", function() {
    var r = new RegExp(this.value.replace(".", ""), "ig");
    $('.branch').each(function() {
        if (!r.test(this.className) && !$(this.parentNode.parentNode).hasClass("infos")) {
            $(this).hide();
        } else {
            $(this).show();
        }
    });
});

// connect to server with socket.io. update called at every branch check
var socket = io(window.location.origin);
socket.on("update", function(data) {
    updateUI(data);
});
