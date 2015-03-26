GRebase
=======

![GRebase](https://imagizer.imageshack.us/v2/1440x801q90/r/674/efed2a.png)

Check the rebase status on all of your repository branch from her parent and do a rebase / merge on a branch with one click (backup too)


When you have a big project with a lot of feature branch based for exemple on your develop branch, or some fix branch based on master branch
you sometimes need to know easily and quickly if these branch are up to date with her parent branch, and if you have some conflict between them.

When no conflict, you can rebase / merge your branch with on click, and they will create a backup branch on server if you need to

When conflict, you have to rebase manually the branch as usual

Features
=======

- Plug to GitHubApi
- Show repo's branches status (UP TO DATE / LATE / CONFLICT)
- Rebase you'r branch from her parent with on click
- Merge parent on your branch to uprade it
- Recover a pre merge / rebase branch state
- Show missing commits from parent branch
- Show last committer on a branch
- Show GitHub PULL REQUEST associate with your branch
- Filter displayed branches
- GRebase action history (like a blame ^^)
- Fullscreen mode for TV Display

Requirement
=======

- [nodejs](http://nodejs.org)
- [npm](https://www.npmjs.com)
- [git](https://help.github.com/articles/set-up-git/)

Start
=======

Go on your GitHub account's settings, and register a new application
the "Authorization callback URL" are very important, you have to fill your own redirect url (server where you put GRebase)
when a GitHubApi oauth append, this redirect will be used to redirect you on your server with oauth token

When it's finished, GitHub gives you a "client id", "client secret" and "client redirect", fill it on config.json below


then create `./config.json` with the repository to check like this:

    {
        "GitHub_API": {
            "client_id":"YOUR ID",
            "client_secret":"YOUR SECRET",
            "client_redirect":"YOUR REDIRECT"
        },
        "repository":[
            {
                "url":"https://github.com/RonanDrouglazet/testGReabse.git",
                "rebase": [
                    {
                        "from":"master",
                        "to":"hotfix.*",
                        "automatic":{"rebase":false,"merge":false}
                    },
                    {
                        "from":"develop",
                        "to":"feature.*",
                        "automatic":{"rebase":false,"merge":false}
                    },
                    {
                        "from":"master",
                        "to":"develop",
                        "automatic":{"rebase":false,"merge":false}
                    },
                    {
                        "from":"master",
                        "to":"release.*",
                        "automatic":{"rebase":false,"merge":false}
                    }
                ]
            }
        ]
    }

info: the key "to" is a RegExp

then run `npm install && node server.js`

-> go on http://localhost:8080
