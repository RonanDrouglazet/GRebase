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
            var branchData = getBranchData(oProject, oBranch);

            if (nProject && !branchData.branchExist) {
                // create branch on interface
                createBranch(oBranch, branchData);
            } else if (nProject) {
                // else update branch node with current infos
                updateBranch(oProject, oBranch, branchData);
            }
        });

        if (nProject) {
            // clean old branch when the remote ref was deleted
            cleanBranchIfNoRemote(oProject);
        }
    });
}

var getBranchData = function(project, branch) {
    var branchClassName = project.name + "_" + branch.name.replace(".", "");
    branch.lastCommit = branch.lastCommit.replace("<", "(").replace(">", ")");

    return {
        branchClassName: branchClassName,
        branchExist: document.getElementsByClassName(branchClassName).length,
        classColor: chooseColor(branch.status),
        container: (branch.status === STATUS.ONGOING) ? "ongoing" : project.name,
        parentBranchName: (branch.parent !== "") ?  " (" + branch.parent + ")" : "",
        button: (branch.status === STATUS.NEED_REBASE && !branch.rebase) ? "<span class='glyphicon glyphicon-refresh rebase' data-toggle='tooltip' data-placement='right' title='rebase the branch'></span>" : ""
    }
}

// get or create project container
var getProjectContainer = function(projectName) {
    var container = document.getElementById(projectName);
    if (!container) {
        $(".main").append("<div id='[PN]'><h2 class='sub-header'>[PN]</h2>".replace(/\[PN\]/ig, projectName) +
            "<div class='table-responsive'><div class='danger'></div><div class='warning'></div><div class='success'></div><div class='default'></div></div></div>");
        $(".nav-sidebar").append("<li><a href='#[PN]'>[PN]</a></li>".replace(/\[PN\]/ig, projectName));
        container = document.getElementById(projectName);
    }
    return container;
}

var createBranch = function(oBranch, branchData) {
    $("#" + branchData.container + " ." + branchData.classColor).append(
        "<div class='branch " + branchData.branchClassName + "'>" +
            "<span class='label label-" + branchData.classColor + "'>" + branchData.classColor.toUpperCase() + "</span><span>" + oBranch.name + branchData.parentBranchName + "</span>" +
            "<span class='badge pull-right' data-toggle='tooltip' data-placement='top' data-html='true' title='missing commits <br/> click to show them'></span>" +
            "<span class='text-muted pull-right' style='font-size:11px'>" + oBranch.lastCommit + "</span>" + branchData.button +
        "</div>"
    );

    // if the branch are on a rebase status NEED_REBASE, we have a "rebase" button to activate
    if (oBranch.status === STATUS.NEED_REBASE) {
        $("." + branchData.branchClassName + " .glyphicon").tooltip();
        $("." + branchData.branchClassName + " .glyphicon").click(clickOnButton);
    }
}

var updateBranch = function(oProject, oBranch, branchData) {
    var branch = $("." + branchData.branchClassName).get(0);
    if (branch) {
        var label = $("." + branchData.branchClassName + " span").get(0);
        var branchName = $("." + branchData.branchClassName + " span").get(1);
        var missCommit = $("." + branchData.branchClassName + " span").get(2);
        var lastCommit = $("." + branchData.branchClassName + " span").get(3);
        var rebaseButton = $(branch).children(".rebase").get(0);
        var recoverButton = $(branch).children(".recover").get(0);

        label.className = "label label-" + branchData.classColor;
        label.innerHTML = branchData.classColor.toUpperCase();
        branchName.innerHTML = oBranch.name;
        lastCommit.innerHTML = oBranch.lastCommit;

        // rebase branch origin
        if (oBranch.parent !== "") {
            branchName.innerHTML += " (" + oBranch.parent + ")";
        }

        // if the branch node are not on the right classColor container or on the right project (cf project "ongoing") move it
        if (branch.parentNode.className !== branchData.classColor || branch.parentNode.parentNode.parentNode.id !== branchData.container) {
            if (branchData.container === "ongoing") {
                $("#" + branchData.container + " ." + branchData.classColor).html("");
                var copy = branch.cloneNode(true);
                copy.className += "_ongoing";
                $("#" + branchData.container + " ." + branchData.classColor).append(copy);
            } else {
                $("#" + branchData.container + " ." + branchData.classColor).append(branch);
            }
        }

        //tolltip on badge
        if (missCommit.innerHTML === "") {
            $(missCommit).tooltip();
            $(missCommit).click(showDiff.bind(this, oProject.url, oBranch.name, oBranch.parent));
        }
        // if we have missings commits information on oBranch, fill badge
        if (oBranch.missCommit) {
            missCommit.innerHTML = oBranch.missCommit;
        } else {
            missCommit.innerHTML = "";
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

// ask a rebase / recover on server for a target branch
var clickOnButton = function() {
    var targetProject = getProject(this);
    var targetBranch = getBranch(this, targetProject);
    var type = this.className.split(" ")[2];

    if ($('.modalAsk .modal-title').html() === "") {
        $('.modalAsk .btn-primary').click(ask);
    }

    $('.modalAsk .modal-title').html("Confirm " + type);
    $('.modalAsk .modal-body').html(targetBranch);
    $('.modalAsk').data({
        branch: targetBranch,
        project: targetProject,
        branchClass: "." + this.parentNode.className.replace("branch ", ""),
        type: type
    });

    $('.modalAsk').modal('show');
}

var ask = function() {
    var data = $('.modalAsk').data();
    socket.emit(data.type, {on: data.branch, from: data.project});
    if (data.type === "rebase") {
        $(data.branchClass).children(".rebase").tooltip("destroy");
        $(data.branchClass).children(".rebase").remove();
    }
    $('.modalAsk').modal('hide');
}

var showDiff = function(project, branch, parent) {
    var compareUrl = project.replace(".git", "") + "/compare/" + branch + "..." + parent;
    window.open(compareUrl, "", "width=1000, height=700");
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

var fullscreen = function(bt) {
    var goFS = bt.innerHTML === "start fullscreen" ? true : false;
    bt.innerHTML = goFS ? "stop fullscreen" : "start fullscreen";
    $(".sidebar").css("display", goFS ? "none" : "block");
    $(".main").css({
        width: goFS ? "100%" : "",
        marginLeft: goFS ? "0" : ""
    });
    $("#ongoing").css({
        position: goFS ? "fixed" : "",
        top: goFS ? "-13px" : "",
        zIndex: goFS ? "1100" : "",
        boxShadow: goFS ? "3px 3px 5px 0px rgba(50, 50, 50, 0.3)" : "",
        width: goFS ? "50%" : "",
        textAlign: goFS ? "right" : "",
        opacity: goFS ? "0.8" : ""
    });
    $("#ongoing h2").css({
        color: goFS ? "#eee" : "",
        paddingBottom: goFS ? "0" : "",
        borderBottom: goFS ? "0" : ""
    });

    //http://stackoverflow.com/questions/20286540/chrome-returns-undefined-for-cancelfullscreen-and-webkitcancelfullscreen
    var el = goFS ? document.documentElement : document;
    var rfs = goFS ?
    (el.requestFullScreen || el.webkitRequestFullScreen || el.mozRequestFullScreen) :
    (el.cancelFullScreen || el.webkitCancelFullScreen || el.mozCancelFullScreen);
    rfs.call(el);

    var autoScroll = function(start) {
        $(document.body).animate({scrollTop: start ? document.body.offsetHeight : -window.innerHeight}, document.body.offsetHeight * 30, "linear", autoScroll.bind(this, !start));
    }

    setTimeout(function() {
        if (goFS) {
            autoScroll(true);
        } else {
            $(document.body).stop();
            $(document.body).animate({scrollTop: 0}, 500);
        }
    }, 1000);
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
