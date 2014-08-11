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
        var nProject = getProjectContainer(oProject.name);

        oProject.branch.forEach(function(oBranch, i) {
            nProject = document.getElementById(oProject.name);

            var branchClassName = oProject.name + "_" + oBranch.name.replace(".", "");
            var branchExist = document.getElementsByClassName(branchClassName).length;
            var classColor = chooseColor(oBranch.status);
            var container = (oBranch.status === STATUS.ONGOING) ? "ongoing" : oProject.name;
            var parentProjectName = (oBranch.parent !== "") ?  " (" + oBranch.parent + ")" : "";
            var button = (oBranch.status === STATUS.NEED_REBASE && !oBranch.rebase) ? "<span class='glyphicon glyphicon-refresh rebase' data-toggle='tooltip' data-placement='right' title='rebase the branch'></span>" : "";

            oBranch.lastCommit = oBranch.lastCommit.replace("<", "(").replace(">", ")");

            // create branch on interface
            if (nProject && !branchExist) {
                $("#" + container + " ." + classColor).append(
                    "<div class='branch " + branchClassName + "'>" +
                        "<span class='label label-" + classColor + "'>" + classColor.toUpperCase() + "</span><span>" + oBranch.name + parentProjectName + "</span>" +
                        "<span class='text-muted' style='float:right;font-size:11px'>" + oBranch.lastCommit + "</span>" + button +
                    "</div>"
                );

                // if the branch are on a rebase status NEED_REBASE, we have a "rebase" button to activate
                if (oBranch.status === STATUS.NEED_REBASE) {
                    $("." + branchClassName + " .glyphicon").tooltip();
                    $("." + branchClassName + " .glyphicon").click(clickOnButton);
                }
            // else update branch node with current infos
            } else if (nProject) {
                var branch = $("." + branchClassName).get(0);
                if (branch) {
                    var label = $("." + branchClassName + " span").get(0);
                    var branchName = $("." + branchClassName + " span").get(1);
                    var lastCommit = $("." + branchClassName + " span").get(2);
                    var rebaseButton = $(branch).children(".rebase").get(0);
                    var recoverButton = $(branch).children(".recover").get(0);

                    label.className = "label label-" + classColor;
                    label.innerHTML = classColor.toUpperCase();
                    branchName.innerHTML = oBranch.name;
                    lastCommit.innerHTML = oBranch.lastCommit;

                    // rebase branch origin
                    if (oBranch.parent !== "") {
                        branchName.innerHTML += " (" + oBranch.parent + ")";
                    }

                    // if the branch node are not on the right classColor container or on the right project (cf project "ongoing") move it
                    if (branch.parentNode.className !== classColor || branch.parentNode.parentNode.parentNode.id !== container) {
                        $("#" + container + " ." + classColor).append(branch);
                    }

                    // if we have not a rebase button, and the branch need for it, put a rebase button. If a rebase was called from somewhere else, don't create the button
                    if (!rebaseButton && oBranch.status === STATUS.NEED_REBASE && !oBranch.rebase) {
                        $(branch).append("<span class='glyphicon glyphicon-refresh rebase' data-toggle='tooltip' data-placement='right' title='rebase the branch'></span>");
                        $(branch).children(".rebase").tooltip();
                        $(branch).children(".rebase").click(clickOnButton);
                    // else, if we have a rebase button, and don't currently need it, remove it
                    } else if (rebaseButton && oBranch.status !== STATUS.NEED_REBASE) {
                        $(rebaseButton).tooltip("destroy");
                        $(rebaseButton).remove();
                    }

                    // if we have not a recover button, and the branch need for it, put a recover button.
                    var backupTitle = "backup create on " + oBranch.backup;
                    if (!recoverButton && oBranch.backup !== "") {
                        $(branch).append("<span class='glyphicon glyphicon-plus recover' data-toggle='tooltip' data-placement='right' title='" + backupTitle + "'></span>");
                        $(branch).children(".recover").tooltip();
                        $(branch).children(".recover").click(clickOnButton);
                    // else, update title if needed
                    } else if (recoverButton && oBranch.status === STATUS.ONGOING) {
                        $(recoverButton).tooltip("destroy");
                        $(recoverButton).remove();
                    } else if (recoverButton && $(recoverButton).attr("title") !== backupTitle) {
                        $(recoverButton).attr("title", backupTitle);
                    }
                }
            }
        });

        // clean old branch when the remote ref was deleted
        if (nProject) {
            cleanBranchIfNoRemote(oProject);
        }
    });
}

// get or create project container
var getProjectContainer = function(projectName) {
    var container = document.getElementById(projectName);
    if (!container) {
        $(".main").append("<div id='[PN]'><h2 class='sub-header'>[PN]</h2>".replace(/\[PN\]/ig, projectName) +
            "<div class='table-responsive'><div class='success'></div><div class='warning'></div><div class='danger'></div><div class='default'></div></div></div>");
        $(".nav-sidebar").append("<li><a href='#[PN]'>[PN]</a></li>".replace(/\[PN\]/ig, projectName));
        container = document.getElementById(projectName);
    }
    return container;
}

// ask a rebase / recover on server for a target branch
var clickOnButton = function() {
    var targetProject = getProject(this);
    var targetBranch = getBranch(this, targetProject);
    var type = this.className.split(" ")[2];

    if ($('.modal-title').html() === "") {
        $('.modal .btn-primary').click(ask);
    }

    $('.modal-title').html("Confirm " + type);
    $('.modal-body').html(targetBranch);
    $('.modal').data({
        branch: targetBranch,
        project: targetProject,
        branchClass: "." + this.parentNode.className.replace("branch ", ""),
        type: type
    });

    $('.modal').modal('show');
}

var ask = function() {
    var data = $('.modal').data();
    socket.emit(data.type, {on: data.branch, from: data.project});
    if (data.type === "rebase") {
        $(data.branchClass).children(".rebase").tooltip("destroy");
        $(data.branchClass).children(".rebase").remove();
    }
    $('.modal').modal('hide');
}

// clean branch if whe have not a remote ref for it
var cleanBranchIfNoRemote = function(project) {
    $("#" + project.name + " .branch").each(function(index, nBranch) {
        var isExist = false;
        var nBranchName = nBranch.className.replace("branch ", "").replace(project.name + "_", "");
        project.branch.forEach(function(oBranch) {
            if (oBranch.name.replace(".", "") === nBranchName) {
                isExist = true;
            }
        });
        if (!isExist) {
            $(nBranch).remove();
        }
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

var getProject = function(button) {
    return button.parentNode.parentNode.parentNode.parentNode.id;
}

var getBranch = function(button, project) {
    return button.parentNode.className.replace("branch ", "").replace(project + "_", "");
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
