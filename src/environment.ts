import {GitHub} from '@actions/github';
import { getInput } from '@actions/core';

import { ReposGetResponse, UsersGetByUsernameResponse, ReposGetLatestReleaseResponse } from '@octokit/rest';

enum KnownGitHubEnvironmentKey {
    WORKFLOW,
    ACTION,
    ACTOR,
    EVENT_NAME,
    EVENT_PATH,
    WORKSPACE,
    SHA,
    REF,
    HEAD_REF,
    BASE_REF,
    REPOSITORY
};

export type KnownGitHubEnvironmentKeyObject = {
    [property in keyof typeof KnownGitHubEnvironmentKey]: string;
}

export type GitHubContext = {
    client: GitHub,
    environment: KnownGitHubEnvironmentKeyObject,
    repository: ReposGetResponse,
    owner: UsersGetByUsernameResponse,
    latestRelease: ReposGetLatestReleaseResponse | null,
    token: string,
    shouldPublish: boolean
};

let cachedContextPromise: Promise<GitHubContext>;

export async function getGitHubContext(): Promise<GitHubContext> {
    if(cachedContextPromise)
        return await cachedContextPromise;

    cachedContextPromise = new Promise<GitHubContext>(async (resolve) => {
        const token = getInput('gitHubToken');
        if(!token) {
            throw new Error("No GitHub token provided. Provide one with the input 'gitHubToken'.")
        }

        console.debug("got token with length", token.length)

        let environment: KnownGitHubEnvironmentKeyObject = {} as any;
        for(let key in KnownGitHubEnvironmentKey) {
            if(!isNaN(+key))
                continue;

            let value = process.env['GITHUB_' + key];
            if(!value)
                continue;

            environment[key] = value;
        }

        let [owner, repo] = environment.REPOSITORY.split('/');

        let client = new GitHub(token);

        let userResponse = await client.users.getByUsername({
            username: owner
        });

        let repositoryResponse = await client.repos.get({
            owner,
            repo
        });

        let latestReleaseResponse = await client.repos.getLatestRelease({
            owner,
            repo
        }).catch(() => null);

        let context: GitHubContext = {
            client,
            repository: repositoryResponse.data,
            owner: userResponse.data,
            latestRelease: latestReleaseResponse && latestReleaseResponse.data,
            environment,
            token,
            shouldPublish: !!token
        };

        resolve(context);
    });

    return await cachedContextPromise;
}