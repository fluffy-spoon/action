import xml2js from 'xml2js';
import fs from 'fs';
import { basename, extname, dirname, join } from 'path';
import { logDebug } from '../helpers';

export type StringBoolean = 'true' | 'false';
export type TestSdkString = 'Microsoft.NET.Test.Sdk' | string;
export type SdkString =
    'Microsoft.NET.Sdk' |
    TestSdkString |
    string;

export interface PropertyGroupXmlNode {
    TargetFramework?: ['netstandard2.0'],
    IsPackable?: [StringBoolean],
    NuspecFile?: [string]
};

export interface ProjectFileXmlNode {
    Project: {
        $: {
            Sdk: SdkString
        },
        PropertyGroup: Array<PropertyGroupXmlNode>,
        ItemGroup: Array<{
            PackageReference: Array<{
                $: {
                    Include: SdkString | string,
                    Version: string
                }
            }>
        }>
    }
}

export interface PackageReference {
    name: SdkString | string;
    version: string;
}

export interface Project {
    xmlNode: ProjectFileXmlNode;
    isTestProject: boolean;
    packageReferences: PackageReference[];
    csprojFilePath: string;
    directoryPath: string;
    nuspecFilePath: string;
    name: string;
}

export default class ProjectFileParser {
    static async readProject(filePath: string): Promise<Project> {
        let fileContents = fs.readFileSync(filePath);
        logDebug('read project file', filePath, filePath);

        let xml: ProjectFileXmlNode = await xml2js.parseStringPromise(fileContents);
        logDebug('parsed project file', filePath, JSON.stringify(xml));

        let knownTestSdkStrings = new Array<TestSdkString>();
        knownTestSdkStrings.push('Microsoft.NET.Test.Sdk');

        let packageReferences = new Array<PackageReference>();
        if(xml.Project.ItemGroup) {

            for (let itemGroupElement of xml.Project.ItemGroup) {
                if(!itemGroupElement.PackageReference)
                    continue;

                for (let packageReferenceElement of itemGroupElement.PackageReference) {
                    packageReferences.push({
                        name: packageReferenceElement.$.Include,
                        version: packageReferenceElement.$.Version
                    });
                }
            }

        }

        let properties = new Array<PropertyGroupXmlNode>();
        if(xml.Project.PropertyGroup) {

            for(let propertyGroupElement of xml.Project.PropertyGroup) {
                properties.push(propertyGroupElement);
            }

        }

        let isTestProject = packageReferences.findIndex(
            p => knownTestSdkStrings.indexOf(p.name) > -1) > -1;

        let directoryPath = dirname(filePath);
        let name = basename(filePath, extname(filePath));

        let nuspecFilePath = 
            properties
                .map(p => p.NuspecFile && p.NuspecFile[0])
                .filter(p => !!p)
                .map(p => join(
                    directoryPath, 
                    p as string))[0] ||
            join(directoryPath, `${name}.nuspec`);

        return {
            xmlNode: xml,
            isTestProject,
            packageReferences,
            csprojFilePath: filePath,
            nuspecFilePath,
            name,
            directoryPath
        };
    }
}