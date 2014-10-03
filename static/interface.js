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
    data.repository.forEach(function(oProject, index) {
        var nProject = getProjectContainer(oProject.name);

        if (oProject.branch) {
            oProject.branch.forEach(function(oBranch, i) {
                var branchData = getBranchData(oProject, oBranch);

                if (nProject && !branchData.branchExist) {
                    // create branch on interface
                    createBranch(oProject, oBranch, branchData);
                } else if (nProject) {
                    // else update branch node with current infos
                    updateBranch(oBranch, branchData);
                }
            });
        }

        if (nProject) {
            // clean old branch when the remote ref was deleted
            cleanBranchIfNoRemote(oProject);

            if (!oProject.token) {
                addConnectButton(nProject, index);
            } else {
                removeConnectButton(nProject);
            }
        }
    });
}

var addConnectButton = function(project, id) {
    if ($(project).children(".btn-success").length === 0) {
        $(project).append("<button type='button' class='btn btn-success'>Connect you to start the process</button>").click(function() {
            window.open("/getToken/" + id, "", "width=1000, height=700");
        });
    }
}

var removeConnectButton = function(nProject) {
    $(nProject).children("button").remove();
}

var getBranchData = function(project, branch) {
    var branchClassName = project.name + "_" + branch.name.replace(".", "");
    branch.lastCommit = branch.lastCommit.replace("<", "(").replace(">", ")");

    return {
        branchClassName: branchClassName,
        branchExist: document.getElementsByClassName(branchClassName).length,
        classColor: chooseColor(branch.status),
        container: (branch.status === STATUS.ONGOING) ? "ongoing" : project.name,
        parentBranchName: (branch.parent !== "") ?  " (" + branch.parent + ")" : ""
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

var createBranch = function(oProject, oBranch, branchData) {
    $("#" + branchData.container + " ." + branchData.classColor).append(
        "<div class='branch " + branchData.branchClassName + "'>" +
            "<span class='label label-" + branchData.classColor + "'>" + branchData.classColor.toUpperCase() + "</span>" + // status
            "<span class='glyphicon glyphicon-cog'></span>" + // setting
            "<span>" + oBranch.name + branchData.parentBranchName + "</span>" + // branch name
            "<span class='badge pull-right' data-toggle='tooltip' data-placement='top' data-html='true' title='missing commits <br/> click to show them'></span>" + // badge miss commit
            "<span class='text-muted pull-right' style='font-size:11px'>" + oBranch.lastCommit + "</span>" + //last commit author
        "</div>"
    );

    // setting button
    var setting = $("." + branchData.branchClassName + " span").get(1);
    $(setting).click(showBranchActions.bind(this, oProject, oBranch));

    // tooltip and click on badge "miss commit"
    var missCommit = $("." + branchData.branchClassName + " span").get(2);
    $(missCommit).tooltip();
    $(missCommit).click(showDiff.bind(this, oProject.url, oBranch.name, oBranch.parent));
}

var updateBranch = function(oBranch, branchData) {
    var branch = $("." + branchData.branchClassName).get(0);
    if (branch) {
        var branchElement = $("." + branchData.branchClassName + " span");
        var label = branchElement.get(0);
        var setting = branchElement.get(1);
        var branchName = branchElement.get(2);
        var missCommit = branchElement.get(3);
        var lastCommit = branchElement.get(4);

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

        // if we have missings commits information on oBranch, fill badge
        if (oBranch.missCommit) {
            missCommit.innerHTML = oBranch.missCommit;
        } else {
            missCommit.innerHTML = "";
        }
    }
}

var showBranchActions = function(oProject, oBranch) {
    // first call, add click on actions buttons
    if ($('.modalAsk .modal-title').html() === "") {
        $('.modalAsk .modal-body button').click(ask);
    }

    $('.modalAsk .modal-title').html(oBranch.name);

    // merge button
    $('.modalAsk .merge').html('merge <i>' + oBranch.parent + '</i> on it');
    if (!oBranch.merge.allow) {
        $('.modalAsk .merge').attr("disabled", "disabled");
    } else {
        $('.modalAsk .merge').removeAttr("disabled");
    }

    // rebase button
    $('.modalAsk .rebase').html('rebase from <i>' + oBranch.parent + '</i>');
    if (!oBranch.rebase.allow) {
        $('.modalAsk .rebase').attr("disabled", "disabled");
    } else {
        $('.modalAsk .rebase').removeAttr("disabled");
    }

    // recover button
    if (oBranch.backup) {
        $('.modalAsk .recover').removeAttr("disabled");
        $('.modalAsk .recover').attr("title", "backup create on " + oBranch.backup);
        $('.modalAsk .recover').tooltip();
    } else {
        $('.modalAsk .recover').attr("disabled", "disabled");
    }

    $('.modalAsk').data({
        oBranch: oBranch,
        oProject: oProject
    });

    $('.modalAsk').modal('show');
}

// ask a rebase / recover on server for a target branch
var ask = function() {
    var data = $('.modalAsk').data();
    var type = this.className.split(" ")[0];
    window.open("/ask/" + type + "/" + data.oBranch.name + "/" + data.oProject.name, "", "width=1000, height=700");
    console.log("/ask/" + type + "/" + data.oBranch.name + "/" + data.oProject.name);
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

// if interface called with ?fullscreen on url GET param, auto active fullscreen
if (window.location.search.indexOf("fullscreen") !== -1) {
    $("#fullscreenBT").click();
}
