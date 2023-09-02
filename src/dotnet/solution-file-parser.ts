import fs from 'fs';
import { dirname, join, sep } from 'path';
import ProjectFileParser, { Project } from './project-file-parser';
import { logDebug } from '../helpers';

export default class SolutionFileParser {
    static async getProjects(solutionFile: string) {
        let guidRegex = `\\{[A-F0-9]{8}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{12}\\}`;
        let projectLineRegex = new RegExp(`Project\\(\"${guidRegex}\"\\) = \"(.+)\", \"(.+)\", \"${guidRegex}\"`);

        let lines = fs
            .readFileSync(solutionFile)
            .toString()
            .replace('\r', '')
            .split('\n');

        let projects = new Array<Project>();

        for(let line of lines) {
            let match = projectLineRegex.exec(line);
            if(!match || match.length < 3)
                continue;

            logDebug('detected project from solution file', solutionFile, match);

            let projectFilePath = join(
                dirname(solutionFile),
                match[2]).replace(/\\/g, sep);
            projects.push(await ProjectFileParser.readProject(projectFilePath));
        }

        return projects;
    }
}