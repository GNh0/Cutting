import test from 'node:test';
import assert from 'node:assert/strict';
import {optimize,optimizeHybrid} from '../src/optimizer.js';
import {scenario,compare} from '../tools/benchmark-scenarios.mjs';
import {auditResult} from '../tools/benchmark-audit.mjs';
test('hybrid keeps the best full result, preserves feasibility, and has monotonic progress',()=>{for(let i=0;i<40;i++){const p=scenario(i,'holdout'),progress=[],r=optimizeHybrid(p,v=>progress.push(v),12);const profiles=[optimize(p,()=>{},{family:'current',budget:12,rankMode:'largest'}),optimize(p,()=>{},{family:'current',budget:12}),optimize(p,()=>{},{family:'portfolio',budget:24}),optimize(p,()=>{},{family:'guided',budget:12})];for(const a of profiles)assert.ok(compare(r,a)<=0);auditResult(r,p);assert.equal(r.iterations,60);assert.equal(progress.at(-1),100);for(let j=1;j<progress.length;j++)assert.ok(progress[j]>=progress[j-1]);}});
