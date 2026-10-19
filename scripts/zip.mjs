import archiver from 'archiver';
import {mkdir} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
await mkdir('artifacts',{recursive:true});const output=createWriteStream('artifacts/x-nuke-extension.zip');const archive=archiver('zip',{zlib:{level:9}});archive.on('error',error=>{throw error;});archive.pipe(output);archive.directory('apps/extension/dist',false);await archive.finalize();
