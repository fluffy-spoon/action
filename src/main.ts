import glob from 'glob';
import path from 'path';

import { exec } from '@actions/exec';

const workspacePath = process.env.GITHUB_WORKSPACE as string;
if(typeof workspacePath === "undefined")
    throw new Error('Could not find workspace path.');

async function compileSolutionFile(solutionFile: string) {
    console.log('building', solutionFile);
    await exec("dotnet", ["build"], {
        cwd: path.dirname(solutionFile)
    });
}

async function testSolutionFile(solutionFile: string) {
    console.log('testing', solutionFile);
    await exec("dotnet", ["test"], {
        cwd: path.dirname(solutionFile)
    });
}

async function packSolutionFile(solutionFile: string) {
    console.log('packing', solutionFile);
    await exec("dotnet", [
        "pack",
        "--output",
        __dirname,
        "--include-symbols",
        "p:SymbolPackageFormat=snupkg"
    ], {
        cwd: path.dirname(solutionFile)
    });
}

async function globSearch(pattern: string) {
    return new Promise<string[]>((resolve, reject) => 
        glob(path.join(workspacePath, pattern), {}, (err, files) => {
            if(err)
                return reject(err);

            return resolve(files);
        }));
}

async function handleDotNetSolutionFiles() {
    var solutionFiles = await globSearch("**/*.sln");
    for (let solutionFile of solutionFiles) {
        await compileSolutionFile(solutionFile);
        await testSolutionFile(solutionFile);
        await packSolutionFile(solutionFile);
    }
}

async function run() {
    await handleDotNetSolutionFiles();
}

run().catch(console.error);
export default run; 
