import { readFileSync } from "fs";
import { dirname } from "path";

export type DependencyVersion = string;

export interface Dependencies {
    [dependencyName: string]: DependencyVersion;
}

export interface PackageJson {
    author: string;
    name: string;
    description: string;
    version: string;
    repository: {
        type: 'git',
        url: string
    },
    main: string;
    files: string[];
    engines: {
        node: string;
    },
    dependencies: Dependencies;
    devDependencies: Dependencies;
    scripts: {
        [commandName: string]: string
    },
    license: 'ISC';
    funding: {
        url: string;
    }
}

export interface NodeJsPackage {
    packageJson: PackageJson;

    directoryPath: string;
    packageJsonFilePath: string;

    hasTestCommand: boolean;
    hasBuildCommand: boolean;
}

export default class PackageJsonParser {
    static readPackage(filePath: string): NodeJsPackage {
        let packageJson = JSON.parse(readFileSync(filePath).toString()) as PackageJson;
        return {
            packageJson,
            directoryPath: dirname(filePath),
            packageJsonFilePath: filePath,
            hasBuildCommand: 'build' in packageJson.scripts,
            hasTestCommand: 'test' in packageJson.scripts
        };
    }
}