import { join, dirname, resolve } from 'path';

import SolutionFileParser from './solution-file-parser';
import xml2js from 'xml2js';

import { getGitHubContext } from '../environment';
import { globSearch, logDebug, runProcess } from '../helpers';
import { Project } from './project-file-parser';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { error } from '@actions/core';
import { copy } from 'fs-extra';
import klawSync from 'klaw-sync';

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
    let gitHub = await getGitHubContext();

    let nugetConfigContents = `<?xml version="1.0" encoding="utf-8"?>
        <configuration>
        <config>
            <add key="DefaultPushSource" value="CustomFeed" />
        </config>
        <packageSources>
            <add key="CustomFeed" value="https://nuget.pkg.github.com/${gitHub.owner.login}/index.json" />
        </packageSources>
        <packageSourceCredentials>
            <CustomFeed>
                <add key="Username" value="${gitHub.repository.owner.login}" />
                <add key="ClearTextPassword" value="${gitHub.token}" />
            </CustomFeed>
        </packageSourceCredentials>
        </configuration>`;

    logDebug('writing nuget.config', nugetConfigContents);

    writeFileSync(
        join(project.directoryPath, 'nuget.config'),
        nugetConfigContents);
    
    logDebug('publishing package', project.nuspecFilePath);

    let version = await getProjectVersion(project);

    await runProcess("dotnet", [
        "nuget",
        "push",
        join(project.directoryPath, `${project.name}.${version}.nupkg`),
        "--api-key",
        gitHub.token
    ], {
        cwd: project.directoryPath
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
    logDebug('installing dotnet');

    await installDotNet();

    logDebug('scanning for solutions');

    var solutionFiles = await globSearch("**/*.sln");
    logDebug('solutions found', solutionFiles);

    for (let solutionFile of solutionFiles) {
        let projects = await SolutionFileParser.getProjects(solutionFile);
        logDebug('projects detected', solutionFile, projects);

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

async function installDotNet() {
    logDebug('installing dotnet', __dirname, klawSync(join(__dirname, '..')));

    await copy(
        join(__dirname, '..', 'src', 'dotnet', 'setup-dotnet', 'externals'),
        join(__dirname, '..', 'externals'));

    let dotnetInstaller = await import('./setup-dotnet/src/installer');
    await new dotnetInstaller.DotnetCoreInstaller('3.0.100', "validated").installDotnet();
}
