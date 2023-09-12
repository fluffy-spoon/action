import { join, dirname, resolve } from 'path';

import SolutionFileParser from './solution-file-parser';
import xml2js from 'xml2js';

import { getGitHubContext } from '../environment';
import { globSearch, logDebug, logInfo, runProcess } from '../helpers';
import { Project } from './project-file-parser';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { error } from '@actions/core';

async function dotnetBuild(solutionFile: string) {
    logDebug('building', solutionFile);

    await runProcess("dotnet", ["build"], {
        cwd: dirname(solutionFile)
    });
}

async function dotnetTest(solutionFile: string) {
    logDebug('testing', solutionFile);

    await runProcess("dotnet", ["test"], {
        cwd: dirname(solutionFile)
    });
}

async function dotnetPack(project: Project) {
    logDebug('packing', project.csprojFilePath);

    await generateNuspecFileForProject(project);

    await runProcess("dotnet", [
        "pack",
        "--include-symbols",
        "--include-source",
        "--output",
        project.directoryPath,
        "-p:SymbolPackageFormat=snupkg",
        `-p:NuspecFile=${project.nuspecFilePath}`,
        `-p:NuspecBasePath=${project.directoryPath}`
    ], {
        cwd: project.directoryPath
    });
}

async function dotnetNuGetPush(project: Project) {  
    const nugetToken = process.env["NUGET_TOKEN"];
    if(!nugetToken) {
        throw new Error("Could not find NuGet token.");
    }
    
    let gitHub = await getGitHubContext();

    await dotnetNuGetPushToFeed({
        feed: `https://nuget.pkg.github.com/${gitHub.owner.login}/index.json`, 
        username: gitHub.repository.owner.login, 
        token: gitHub.token, 
        project
    });

    await dotnetNuGetPushToFeed({
        feed: `https://api.nuget.org/v3/index.json`, 
        username: gitHub.repository.owner.login, 
        token: nugetToken, 
        project
    });
}

async function dotnetNuGetPushToFeed(options: {
    feed: string, 
    username: string, 
    token: string, 
    project: Project
}) {
    let nugetConfigContents = `
        <?xml version="1.0" encoding="utf-8"?>
        <configuration>
            <config>
                <add key="DefaultPushSource" value="CustomFeed" />
            </config>
            <packageSources>
                <add key="CustomFeed" value="${options.feed}" />
            </packageSources>
            <packageSourceCredentials>
                <CustomFeed>
                    <add key="Username" value="${options.username}" />
                    <add key="ClearTextPassword" value="${options.token}" />
                </CustomFeed>
            </packageSourceCredentials>
        </configuration>`;

    logDebug('writing nuget.config', nugetConfigContents);

    writeFileSync(
        join(options.project.directoryPath, 'nuget.config'),
        nugetConfigContents);

    logDebug('publishing package', options.project.nuspecFilePath);

    let version = await getProjectVersion(options.project);

    await runProcess("dotnet", [
        "nuget",
        "push",
        join(options.project.directoryPath, `${options.project.name}.${version}.nupkg`),
        "--api-key",
        options.token
    ], {
        cwd: options.project.directoryPath
    });
}

async function generateNuspecFileForProject(project: Project) {
    let version = await getProjectVersion(project);

    let github = await getGitHubContext();

    let topics = github.repository.topics;
    let nuspecRootXml = `<?xml version="1.0"?>`;
    let newNuspecContents = `${nuspecRootXml}
        <package>
            <metadata>
                <id>${project.name}</id>
                <version>${version}</version>
                <authors>${github.owner.name} (${github.owner.login})</authors>
                <owners>${github.owner.name} (${github.owner.login})</owners>
                <readme>README.md</readme>
                ${github.repository.license && github.repository.license.url ?
                    `<licenseUrl>${github.repository.license.url}</licenseUrl>` :
                    ''}
                <repository type="git" url="${github.repository.git_url}" />
                <projectUrl>${github.repository.html_url}</projectUrl>
                <requireLicenseAcceptance>false</requireLicenseAcceptance>
                <description>${github.repository.description || `The ${project.name} NuGet package.`}</description>
                <releaseNotes>No release notes available.</releaseNotes>
                <copyright>Copyright ${new Date().getFullYear()}</copyright>
                <tags>
                    ${topics ?
                        topics.join(', ') :
                        ''}
                </tags>
                <files>
                    <file src="README.md" target="\" />
                </files>
                <dependencies>
                    ${project.packageReferences
                        .map(x => `<dependency id="${x.name}" version="${x.version}" />`)
                        .join()}
                </dependencies>
            </metadata>
        </package>`;
    const newNuspecXml = await xml2js.parseStringPromise(newNuspecContents);

    if(existsSync(project.nuspecFilePath)) {
        const existingNuspecContents = readFileSync(project.nuspecFilePath).toString();
        const existingNuspecXml = await xml2js.parseStringPromise(existingNuspecContents);

        newNuspecXml.package.metadata[0] = { 
            ... newNuspecXml.package.metadata[0],
            ... existingNuspecXml.package.metadata[0]
        };

        newNuspecContents = new xml2js.Builder({headless: true}).buildObject(newNuspecXml);
        writeFileSync(project.nuspecFilePath, `${nuspecRootXml}${newNuspecContents}`);
    }

    let nuspecPath = join(project.directoryPath, `${project.name}.nuspec`);
    logDebug('generated nuspec', nuspecPath, newNuspecContents, JSON.stringify(newNuspecXml));

    writeFileSync(
        nuspecPath,
        newNuspecContents);
}

async function getProjectVersion(project: Project) {
    if(existsSync(project.nuspecFilePath)) {
        const existingNuspecContents = readFileSync(project.nuspecFilePath).toString();
        const existingNuspecXml = await xml2js.parseStringPromise(existingNuspecContents);

        return existingNuspecXml.package.metadata[0].version[0];
    }

    let github = await getGitHubContext();

    let version = 
        (github.latestRelease && github.latestRelease.name) ||
        '0.0.0';

    version = (+(version.substr(0, 1)) + 1) + version.substr(1);

    return version;
}

export default async function handleDotNet() {
    logDebug('scanning for solutions');

    var solutionFiles = await globSearch("**/*.sln");
    logInfo('solutions found', solutionFiles);

    for (let solutionFile of solutionFiles) {
        let projects = await SolutionFileParser.getProjects(solutionFile);
        logInfo('publishing projects', solutionFile, projects);

        let testProjects = projects.filter(x => x.isTestProject);
        for(let project of testProjects) {
            await dotnetBuild(project.csprojFilePath);
            await dotnetTest(project.csprojFilePath);
        }

        let nonTestProjects = projects.filter(x => !x.isTestProject);
        for(let project of nonTestProjects) {
            await dotnetBuild(project.csprojFilePath);
            await dotnetPack(project);
        }

        for(let project of nonTestProjects) {
            try {
                await dotnetNuGetPush(project);
            } catch(ex: any) {
                error('message' in ex ? ex?.message : ex);
            }
        }
    }
}