import {getOctokit} from '@actions/github';
import { getInput } from '@actions/core';

import { RestEndpointMethodTypes } from '@octokit/rest';
import { logDebug } from './helpers';

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
    client: ReturnType<typeof getOctokit>,
    environment: KnownGitHubEnvironmentKeyObject,
    repository: RestEndpointMethodTypes["repos"]["get"]["response"]["data"],
    owner: RestEndpointMethodTypes["users"]["getByUsername"]["response"]["data"],
    latestRelease: RestEndpointMethodTypes["repos"]["getLatestRelease"]["response"]["data"] | null,
    token: string,
    shouldPublish: boolean
};

let cachedContextPromise: Promise<GitHubContext>;

export async function getGitHubContext(): Promise<GitHubContext> {
    if(cachedContextPromise)
        return await cachedContextPromise;

    cachedContextPromise = new Promise<GitHubContext>(async (resolve) => {
        const token = process.env["GITHUB_TOKEN"];
        if(!token) {
            throw new Error("No GitHub token provided. Provide one with the input 'gitHubToken'.")
        }

        logDebug("got token with length", token.length)

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

        let client = getOctokit(token);

        let userResponse = await client.rest.users.getByUsername({
            username: owner
        });

        let repositoryResponse = await client.rest.repos.get({
            owner,
            repo
        });

        let latestReleaseResponse = await client.rest.repos.getLatestRelease({
            owner,
            repo
        }).catch(() => null);

        let context: GitHubContext = {
            client,
            owner: userResponse.data,
            latestRelease: latestReleaseResponse && latestReleaseResponse.data,
            repository: repositoryResponse.data as GitHubContext["repository"],
            environment,
            token,
            shouldPublish: !!token
        };

        resolve(context);
    });

    return await cachedContextPromise;
}