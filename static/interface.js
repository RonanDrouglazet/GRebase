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
            if (nProject && !branchExist) {
                $("#" + container + " ." + classColor).append(
                    "<div class='branch " + branchClassName + "'>" +
                        "<span class='label label-" + classColor + "'>" + classColor.toUpperCase() + "</span><span>" + oBranch.name + "</span>" +
                    "</div>"
                );
            } else if (nProject) {
                var span = $("." + branchClassName + " span").get(0);
                var branch = $("." + branchClassName).get(0);
                if (span) {
                    span.className = "label label-" + classColor;
                    span.innerHTML = classColor.toUpperCase();
                    if (branch.parentNode.className !== classColor || branch.parentNode.parentNode.parentNode.id !== container) {
                        $("#" + container + " ." + classColor).append(branch);
                    }
                }
            }
        });
    });
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
