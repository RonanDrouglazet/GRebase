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
        var nProject = getProjectContainer(oProject);

        if (oProject.branch) {
            oProject.branch.forEach(function(oBranch, i) {
                var branchData = getBranchData(oProject, oBranch);

                if (nProject && !branchData.branchExist) {
                    // create branch on interface
                    createBranch(oProject, oBranch, branchData);
                } else if (nProject) {
                    // else update branch node with current infos
                    updateBranch(oProject, oBranch, branchData);
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

    // bind events
    $(".branch-author").on("click", function() {
        var selectedAuthorName = $(this).text();
        $("#search-input").val(selectedAuthorName).trigger("input").focus();
    });
}

var addConnectButton = function(project, id) {
    if ($(project).children(".btn-success").length === 0) {
        $(project).append("<button type='button' class='btn btn-success'>Connect you to start the process</button>");
        $(project).children("button").click(function() {
            window.open("/getToken/" + id, "", "width=1050, height=700, scrollbars=1");
        });
    }
}

var removeConnectButton = function(nProject) {
    $(nProject).children("button").remove();
}

var getBranchData = function(project, branch) {
    var branchClassName = project.name + "_" + branch.name.replace(/\.|\//ig, "_");
    branch.lastCommit = branch.lastCommit.replace("<", "(").replace(">", ")");

    return {
        branchClassName: branchClassName,
        branchExist: document.getElementsByClassName(branchClassName).length,
        classColor: chooseColor(branch.status),
        container: (branch.status === STATUS.ONGOING) ? "ongoing" : project.name,
        parentBranchName: (branch.parent !== "") ?  " (" + branch.parent + ")" : ""
    }
}

var onCheck = function() {
    var id = $(this).next().html();
    var hr = JSON.parse(localStorage.getItem('hidden_repo')) || [];

    if (this.checked) {
        $("#" + id).fadeIn()
        hr.splice(hr.indexOf(id) - 1, 1)
    } else {
        $("#" + id).fadeOut()
        hr.push(id)
    }

    localStorage.setItem('hidden_repo', JSON.stringify(hr))
}

// get or create project container
var getProjectContainer = function(project) {
    var container = document.getElementById(project.name);
    var hr = JSON.parse(localStorage.getItem('hidden_repo')) || [];
    var hidden = hr.indexOf(project.name) !== -1

    if (!container) {
        $(".main").append(
            "<div id='" + project.name + "' style='display:" + (hidden ? 'none' : 'block') + "'><h2 class='sub-header'>" + project.name +
            "<span class='glyphicon glyphicon-new-window' data-toggle='tooltip' data-placement='right' title='open repository'></span>" +
            "<span class='glyphicon glyphicon-refresh' data-toggle='tooltip' data-placement='right' title='refresh project&#39;s branches'></span></h2>" +
            "<div class='table-responsive'><div class='danger'></div><div class='warning'></div><div class='success'></div><div class='default'></div></div></div>");
        
        $(".nav-sidebar").append("<li><div class='checkbox'><label><input type='checkbox' " + (hidden ? '' : 'checked') + "><a href='#[PN]'>[PN]</a></label></div></li>".replace(/\[PN\]/ig, project.name));
        $(".nav-sidebar input").last().on("change", onCheck)
        
        container = document.getElementById(project.name);
        var openRepo = container.getElementsByClassName('glyphicon-new-window')[0];
        $(openRepo).click(function() {
            window.open(project.url);
        });
        $(openRepo).tooltip();
        var refresh = container.getElementsByClassName('glyphicon-refresh')[0];
        $(refresh).click(function() {
            socket.emit("refreshProject", {index: project.id});
        });
        $(refresh).tooltip();
    }

    return container;
}

var createBranch = function(oProject, oBranch, branchData) {
    $("#" + branchData.container + " ." + branchData.classColor).append(
        "<div class='branch " + branchData.branchClassName + "'>" +
            "<span class='label label-" + branchData.classColor + "'>" + branchData.classColor.toUpperCase() + "</span>" + // status
            "<span class='glyphicon glyphicon-cog'></span>" + // setting
            "<span>" + oBranch.name + branchData.parentBranchName + "</span>" + // branch name
            "<div class='pull-right fixed-width-small'><span class='badge pull-right' data-toggle='tooltip' data-placement='top' data-html='true' title='missing commits <br/> click to show them'>" + (oBranch.missCommit || "") + "</span></div>" + // badge miss commit
            "<div class='pull-right fixed-width-small'><span class='btn-link pull-right' data-toggle='tooltip' data-placement='top' title='" + (oBranch.pullRequest ? oBranch.pullRequest.title : "") + "'>" + (oBranch.pullRequest ? "#"+oBranch.pullRequest.number : "") + "</span></div>" + //pull request
            "<div class='pull-right'><button type='button' class='btn btn-default btn-xs branch-author'>" + oBranch.lastCommit + "</button></div>" + //last commit author
        "</div>"
    );

    var buttonData = {
        oBranch: oBranch,
        oProject: oProject
    };

    // setting button
    var setting = $("." + branchData.branchClassName + " span").get(1);
    $(setting).data(buttonData);
    $(setting).click(showBranchActions);

    // tooltip and click on badge "miss commit"
    var missCommit = $("." + branchData.branchClassName + " span").get(3);
    $(missCommit).tooltip();
    $(missCommit).data(buttonData);
    $(missCommit).click(showDiff);

    // tooltip and click on the pull request #
    var pullRequest = $("." + branchData.branchClassName + " span").get(4);
    $(pullRequest).tooltip();
    $(pullRequest).data(buttonData);
    $(pullRequest).click(function() {
        var data = $(this).data();
        window.open(data.oBranch.pullRequest.html_url, "", "width=1050, height=700, scrollbars=1");
    });
}

var updateBranch = function(oProject, oBranch, branchData) {
    var branch = $("." + branchData.branchClassName).get(0);
    if (branch) {
        var branchElement = $("." + branchData.branchClassName + " span");
        var label = branchElement.get(0);
        var setting = branchElement.get(1);
        var branchName = branchElement.get(2);
        var missCommit = branchElement.get(3);
        var pullRequest = branchElement.get(4);
        var lastCommit = $(branch).find(".branch-author").get(0);
        var ongoing = $("." + branch.className.split(" ")[1] + "_ongoing");

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
            if (branchData.container === "ongoing" && ongoing.length === 0) {
                var copy = branch.cloneNode(true);
                copy.className += "_ongoing";
                $("#" + branchData.container + " ." + branchData.classColor).append(copy);
            } else if (branchData.container !== "ongoing" && ongoing.length > 0) {
                ongoing.remove();
            }

            if (branchData.container !== "ongoing") {
                $("#" + branchData.container + " ." + branchData.classColor).append(branch);
            }
        } else {
            ongoing.remove();
        }

        // if we have missings commits information on oBranch, fill badge
        if (oBranch.missCommit) {
            missCommit.innerHTML = oBranch.missCommit;
        } else {
            missCommit.innerHTML = "";
        }

        // if we have pull request information, we display it
        if (oBranch.pullRequest) {
            pullRequest.title = oBranch.pullRequest.title;
            pullRequest.innerHTML = "#"+oBranch.pullRequest.number;
        } else {
            pullRequest.title = "";
            pullRequest.innerHTML = "";
        }

        var buttonData = {
            oBranch: oBranch,
            oProject: oProject
        };

        $(setting).data(buttonData);
        $(missCommit).data(buttonData);
        $(pullRequest).tooltip('destroy');
        $(pullRequest).tooltip();
        $(pullRequest).data(buttonData);
    }
}

var showBranchActions = function() {
    // first call, add click on actions buttons
    if ($('.modalAsk .modal-title').html() === "") {
        $('.modalAsk .modal-body button').click(ask);
    }

    var oProject = $(this).data().oProject;
    var oBranch = $(this).data().oBranch;

    $('.modalAsk .modal-title').html(oBranch.name);

    // merge button
    $('.modalAsk .merge').html('merge <i>' + oBranch.parent + '</i> on it');
    $('.modalAsk .merge').css("display", oBranch.merge.allow ? "block" : "none");

    // rebase button
    $('.modalAsk .rebase').html('rebase from <i>' + oBranch.parent + '</i>');
    $('.modalAsk .rebase').css("display", oBranch.rebase.allow ? "block" : "none");

    // recover button
    $('.modalAsk .recover').css("display", oBranch.backup ? "block" : "none");
    $('.modalAsk .recover').attr("title", "backup create on " + oBranch.backup);
    $('.modalAsk .recover').tooltip();

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
    window.open("/ask/" + type + "/" + encodeURIComponent(data.oBranch.name) + "/" + data.oProject.name, "", "width=1050, height=700, scrollbars=1");
    console.log("/ask/" + type + "/" + encodeURIComponent(data.oBranch.name) + "/" + data.oProject.name);
    $('.modalAsk').modal('hide');
}

var showDiff = function() {
    var data = $(this).data();
    var compareUrl = data.oProject.url.replace(".git", "") + "/compare/" + data.oBranch.name + "..." + data.oBranch.parent;
    window.open(compareUrl, "", "width=1050, height=700, scrollbars=1");
}

// clean branch if whe have not a remote ref for it
var cleanBranchIfNoRemote = function(project) {
    $("#" + project.name + " .branch").each(function(index, nBranch) {
        var isExist = false;
        var nBranchName = nBranch.className.replace("branch ", "").replace(project.name + "_", "");
        project.branch.forEach(function(oBranch) {
            if (oBranch.name.replace(/\.|\//ig, "_") === nBranchName) {
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

var addActionOnHistory = function(data) {
    if (data) {
        data.forEach(function(action, index) {
            if (!$(".modalHistory .list-group .d" + action.id).length) {
                $(".modalHistory .list-group").prepend(
                    "<li class='list-group-item d" + action.id + "'>" +
                    "<span class='badge'>" + action.on + "</span>" +
                    "<img width='22' height='22' src='" + action.user.avatar_url + "' class='img-rounded' />   " +
                    "<i>" + action.user.login + "</i> <b>" + action.message + "</b></li>");
            }
        });
    } else {
        $(".modalHistory .list-group").html("");
    }
}

//filter branch with input
$("#search-input").on("input", function() {
    var r = new RegExp(this.value.replace(/\./ig, ""), "ig");
    $('.branch').each(function() {
        var branchAuthorName = $(this).find(".branch-author").text();
        if (!r.test(this.className) && !r.test(branchAuthorName) && !$(this.parentNode.parentNode).hasClass("infos")) {
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
socket.on("history", function(data) {
    addActionOnHistory(data);
});

// if interface called with ?fullscreen on url GET param, auto active fullscreen
if (window.location.search.indexOf("fullscreen") !== -1) {
    $("#fullscreenBT").click();
}
