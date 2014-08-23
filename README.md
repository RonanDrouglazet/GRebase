GRebase
=======

![GRebase](https://imagizer.imageshack.us/v2/1440x801q90/r/674/efed2a.png)

Check the rebase status on all of your repository branch from her parent and do a rebase on a branch with one click (backup too) 


When you have a big project with a lot of feature branch based for exemple on your develop branch, or some fix branch based on master branch
you sometimes need to know easily and quickly if these branch are up to date with her parent branch, and if you have some conflict between them. 

When no conflict, you can rebase your branch with on click, and they will create a backup branch on server if you need to 

When conflict, you have to rebase manually the branch as usual

Requirement
=======

    - [nodejs](http://nodejs.org)
    - git + ssh key on host machine (connect with GithubApi comming later)

Start
=======

create `./config.json` with the repository to check like this:

    [{
        "url": "https://github.com/RonanDrouglazet/GRebase.git",
        "rebase" : [
            {
                "from": "master",
                "to": "hotfix.*"
            },
            {
                "from": "develop",
                "to": "feature.*"
            }
        ]
    },
    {
        "url": "https://github.com/RonanDrouglazet/GRebaseBis.git",
        "rebase" : [
            {
                "from": "master",
                "to": "develop"
            }
        ]
    }]

info: the key "to" is a RegExp

then run `npm install && node server.js`

-> go on http://localhost:8080
