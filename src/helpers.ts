import {glob} from 'glob';
import fs from 'fs';
import http from 'http';

import { join } from "path";

import { getGitHubContext } from './environment';

import { setFailed, debug, error, info } from '@actions/core';
import { exec } from '@actions/exec';

import { ExecOptions } from '@actions/exec/lib/interfaces';

export async function globSearch(pattern: string, ignore?: string[]) {
    logDebug('begin-glob', pattern);

    let context = await getGitHubContext();
    const files = await glob(
        join(context.environment.WORKSPACE, pattern), 
        {
            ignore: ignore || []
        });
        
    logDebug('end-glob', files);

    return files;
}

export async function downloadFile(localFilePath: string, url: string) {
    var file = fs.createWriteStream(localFilePath);
    return new Promise<void>((resolve, reject) => {
        http.get(url, function (response) {
            response.pipe(file);
            file.on('finish', function () {
                file.close();
                resolve();
            });
        }).on('error', function (err) {
            fs.unlinkSync(localFilePath);
            reject(err);
        });
    });
}

export async function runProcess(commandLine: string, args?: string[], options?: ExecOptions) {
    let result = await exec(commandLine, args, options);
    if(result !== 0)
        return fail('Process ' + commandLine + ' exited with non-zero exit code: ' + result);
}

export function fail(obj: any) {
    logError(obj);
    setFailed(obj.message || obj);
}

export function logError(...params: any[]) {
    error(JSON.stringify(params));
}

export function logDebug(...params: any[]) {
    debug(JSON.stringify(params));
}

export function logInfo(...params: any[]) {
    info(JSON.stringify(params));
}