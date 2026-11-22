import json, hashlib, statistics, math, datetime, sys, gzip
from pathlib import Path

ROOT=Path(sys.argv[1]) if len(sys.argv)>1 else Path(__file__).resolve().parent
inputs={}
def read(name):
    p=ROOT/name
    if p.exists(): raw=p.read_bytes()
    elif p.with_name(p.name+'.gz').exists(): raw=gzip.decompress(p.with_name(p.name+'.gz').read_bytes())
    else: return None
    inputs[name]={'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw)}
    return json.loads(raw)
def stat(values):
    values=list(values)
    return {'median':statistics.median(values),'min':min(values),'max':max(values),'valuesByRepetition':values} if values else None
def unique(values):
    out=[]
    for value in values:
        if value not in out: out.append(value)
    return {'identicalAcrossRepetitions':len(out)<=1,'values':out}
def paired_metrics(report, wall_key, cpu_key):
    pairs=[]
    for a,b in zip(report['runs']['baseline'],report['runs']['optimized']):
        row={'repetition':a['repetition']}
        for label,block,metric in [('wallP50',wall_key,'p50'),('wallP95',wall_key,'p95'),('wallP99',wall_key,'p99'),('processCpuMean',cpu_key,'mean')]:
            av,bv=a[block][metric],b[block][metric]
            row[label]={'baseline':av,'optimized':bv,'delta':bv-av,'relativeDeltaPercent':100*(bv/av-1) if av else None}
        pairs.append(row)
    return {'pairs':pairs,'pairedDeltaSummary':{k:stat(p[k]['delta'] for p in pairs) for k in ('wallP50','wallP95','wallP99','processCpuMean')}}
def summarize_runner(name):
    data=read(name)
    if data is None: return None
    out={k:data[k] for k in ('mode','referenceCommit','sources','runtime','configuration')}
    out['sourceFile']=name
    out['reports']=[]
    for r in data['reports']:
        item={k:r[k] for k in ('scenario','phase','pieces','hz','identicalFinalState','renderPreservesState','stopped','lastCompleted') if k in r}
        item['completedPairs']=min(len(r['runs']['baseline']),len(r['runs']['optimized']))
        item['completed']=bool(r.get('identicalFinalState')) and not r.get('stopped')
        item['stateHashes']=r.get('stateSha256',[])
        item['stateHashSameAcrossRepetitions']=len(set(item['stateHashes']))<=1 if item['stateHashes'] else None
        item['variants']={}
        wall_key='wallMsPerSimulatedFrame' if data['mode']=='matrix' else 'wallMsPerOperation'
        cpu_key='processCpuMsPerSimulatedFrame' if data['mode']=='matrix' else 'processCpuMsPerOperation'
        for variant,runs in r['runs'].items():
            v={'completedRuns':len(runs)}
            if runs:
                v['setupMs']=stat(x['setupMs'] for x in runs)
                v['warmupMs']=stat(x['warmupMs'] for x in runs)
                v['totalCaseMs']=stat(x['totalCaseMs'] for x in runs)
                v['inventories']={key:unique(x[key] for x in runs) for key in ('initial','firstFrameInventory','final') if key in runs[0]}
                v['clockBefore']=unique(x['clockBefore'] for x in runs)
                v['clockAfter']=unique(x['clockAfter'] for x in runs)
                v['clockDelta']=unique(x.get('clockDelta',{k:x['clockAfter'][k]-x['clockBefore'][k] for k in ('physics','logic','simTime','droppedSeconds')}) for x in runs)
                if wall_key in runs[0]:
                    v['wallMs']={metric:stat(x[wall_key][metric] for x in runs) for metric in ('mean','p50','p95','p99')}
                    v['processCpuMs']={metric:stat(x[cpu_key][metric] for x in runs) for metric in ('mean','p50','p95','p99')}
                    v['samplesPerRun']=[x[wall_key]['count'] for x in runs]
                    v['firstMeasuredSample']={'wallMs':stat(x['wallSamples'][0] for x in runs),'processCpuMs':stat(x['cpuSamples'][0] for x in runs)}
                    if 'cold' in runs[0]: v['coldFirstDraw']={key:stat(x['cold'][key] for x in runs) for key in ('wallMs','cpuMs')}
                if 'counts' in runs[0]:
                    v['counterRuns']=[{'repetition':x['repetition'],'measuredOperations':x['measuredOperations'],'coldCounts':x['coldCounts'],'totals':x['counts'],'perOperation':{k:value/x['measuredOperations'] for k,value in x['counts'].items()}} for x in runs]
            item['variants'][variant]=v
        if item['completed']:
            assert item['completedPairs']==data['configuration']['repetitions'], (name,r['scenario'],r['pieces'])
            assert len(item['stateHashes'])==item['completedPairs']
            item['pairedInventoriesExact']=all(a[k]==b[k] for a,b in zip(r['runs']['baseline'],r['runs']['optimized']) for k in ('initial','firstFrameInventory','final') if k in a)
            item['pairedClocksExact']=all(a[k]==b[k] for a,b in zip(r['runs']['baseline'],r['runs']['optimized']) for k in ('clockBefore','clockAfter'))
            assert item['pairedInventoriesExact'] and item['pairedClocksExact']
            if data['mode']=='matrix':
                rr=r['runs']['baseline']+r['runs']['optimized']
                item['allRequestedPhysicalStepsExecuted']=all(x['clockDelta']['physics']==len(x['wallSamples'])*r['hz']/60 for x in rr)
                item['simulatedDurationPreserved']=all(abs(x['clockDelta']['simulatedSeconds']-len(x['wallSamples'])/60)<1e-8 for x in rr)
                item['noNewDroppedTime']=all(x['clockDelta']['droppedSeconds']==0 for x in rr)
                assert item['allRequestedPhysicalStepsExecuted'] and item['simulatedDurationPreserved'] and item['noNewDroppedTime']
            else:
                item['renderAdvancesNoSimulation']=all(x['clockBefore']==x['clockAfter'] for x in r['runs']['baseline']+r['runs']['optimized'])
                assert item['renderAdvancesNoSimulation']
            if 'counts' in r['runs']['baseline'][0]:
                item['drawCallAndVertexCountsEqual']=all(a['counts'][key]==b['counts'][key] for a,b in zip(r['runs']['baseline'],r['runs']['optimized']) for key in ('drawOutline','drawArrays','vertices'))
                item['optimizedNoPerDrawUploads']=all(x['counts']['bufferData']==0 and x['counts']['bufferDataBytes']==0 and x['counts']['wideLineTriangles']==0 for x in r['runs']['optimized'])
                assert item['drawCallAndVertexCountsEqual'] and item['optimizedNoPerDrawUploads']
            if wall_key in r['runs']['baseline'][0]:item.update(paired_metrics(r,wall_key,cpu_key))
        out['reports'].append(item)
    out['completedConfigurations']=sum(r['completed'] for r in out['reports'])
    out['completedPairs']=sum(r['completedPairs'] for r in out['reports'] if r['completed'])
    out['stoppedConfigurations']=[{k:r[k] for k in ('scenario','pieces','hz','stopped','lastCompleted') if k in r} for r in out['reports'] if not r['completed']]
    all_runs=[x for r in data['reports'] for runs in r['runs'].values() for x in runs]
    out['totalCaseMsMax']=max((x['totalCaseMs'] for x in all_runs),default=None)
    if data['mode']=='matrix':
        out['totalMeasuredFramesBothVariants']=sum(len(x['wallSamples']) for x in all_runs)
        out['totalMeasuredPhysicsStepsBothVariants']=sum(x['clockDelta']['physics'] for x in all_runs)
        out['totalMeasuredDroppedSecondsBothVariants']=sum(x['clockDelta']['droppedSeconds'] for x in all_runs)
    if name.startswith('matrix-settled'):
        out['firstScaleAbove16_67Ms']={variant:{metric:next(({'pieces':r['pieces'],'medianMs':r['variants'][variant]['wallMs'][metric]['median']} for r in out['reports'] if r['completed'] and r['variants'][variant]['wallMs'][metric]['median']>16.67),None) for metric in ('p50','p95','p99')} for variant in ('baseline','optimized')}
    return out

main_names=['matrix-settled-60.json','matrix-settled-120.json','matrix-settled-240.json','matrix-settling-120.json','matrix-controls-120.json']
main=[summarize_runner(name) for name in main_names]
outline=summarize_runner('outlines.json')
counts=summarize_runner('outline-counts.json')
post=[summary for name in ('isolated-1500-240.json','control-long-120.json') if (summary:=summarize_runner(name)) is not None]

ed=read('equivalence.json')
equivalence={'sourceFile':'equivalence.json','sources':ed['sources'],'configuration':ed['configuration'],'reports':[]}
for r in ed['reports']:
    assert r['identicalFinalState'] and r['baseline']==r['optimized']
    equivalence['reports'].append({**r,'identicalSummariesVerified':True,'requestedMinusSimulatedMinusDroppedSeconds':{v:r[v]['requestedSeconds']-r[v]['simulatedSeconds']-r[v]['droppedSeconds'] for v in ('baseline','optimized')}})
equivalence['completedPairs']=len(equivalence['reports'])

pd=read('profile.json')
profile={k:pd[k] for k in ('method','sources','toolSha256','fixturesSha256','node','runtime','configuration','identicalFinalStateBetweenVariants')}
profile['sourceFile']='profile.json';profile['reports']=[];profile['diagnostics']=[]
for r in pd['reports']:
    item={k:r[k] for k in ('variant','scenario','pieces','hz','inventory','cpuTop','allocationTop','gcDuringCpuProfile','gcDuringHeapProfile','heapBefore','heapAfter','profiles','identicalStateAcrossProfileCaptures')}
    item['heapDeltaBytesAfterExplicitCollection']={k:r['heapAfter'][k]-r['heapBefore'][k] for k in r['heapBefore']}
    item['captures']={kind:{k:v for k,v in cap.items() if k!='top'} for kind,cap in r['captures'].items()}
    profile['reports'].append(item)
for diag in pd['diagnostics']:
    result={'variant':diag['variant'],'identicalStateWithInstrumentation':diag['identicalStateWithInstrumentation'],'instrumentationPairs':len(diag['runs'])//2,'modes':{}}
    for active in (False,True):
        runs=[r for r in diag['runs'] if r['instrumented']==active]
        item={'wallMsPerFrame':stat(r['wallMs']/r['frames'] for r in runs),'processCpuMsPerFrame':stat(r['processCpuMs']/r['frames'] for r in runs),'inventories':unique(r['inventory'] for r in runs),'clocks':unique(r['clockDelta'] for r in runs)}
        if active:
            names=sorted(set().union(*(r['blocks'] for r in runs)))
            item['inclusiveBlocks']={name:{'calls':stat(r['blocks'].get(name,{}).get('calls',0) for r in runs),'msPerFrame':stat(r['blocks'].get(name,{}).get('inclusiveMs',0)/r['frames'] for r in runs),'msPerCall':stat(r['blocks'][name]['inclusiveMs']/r['blocks'][name]['calls'] for r in runs if name in r['blocks'] and r['blocks'][name]['calls'])} for name in names}
            names=sorted(set().union(*(r['cannonPhaseMeanMsPerStep'] for r in runs)))
            item['cannonPhaseMsPerStep']={name:stat(r['cannonPhaseMeanMsPerStep'][name] for r in runs) for name in names}
        result['modes']['on' if active else 'off']=item
    profile['diagnostics'].append(result)
profile['capturePairsBetweenVersions']=len(pd['reports'][0]['captures'])
profile['instrumentationPairsWithinVersions']=sum(d['instrumentationPairs'] for d in profile['diagnostics'])
profile['captureStateHashesMatchBetweenVersions']={kind:pd['reports'][0]['captures'][kind]['stateSha256']==pd['reports'][1]['captures'][kind]['stateSha256'] for kind in pd['reports'][0]['captures']}
assert all(profile['captureStateHashesMatchBetweenVersions'].values())

existing={}
for name,field in [('architecture','reports'),('ground','cases')]:
    a=read(name+'-baseline.json');b=read(name+'-final.json')
    if a is None or b is None:continue
    existing[name]={'baselineSourceSha256':a['sourceSha256'],'optimizedSourceSha256':b['sourceSha256'],'comparisons':len(a[field]),'exactResultsEqual':a[field]==b[field]}
    if name=='ground':existing[name].update(summaryEqual=a['summary']==b['summary'],summary=b['summary'])
    if name=='architecture':existing[name]['labels']=[r['label'] for r in a[field]]
    assert existing[name]['exactResultsEqual']

orig1500=next(r for d in main if d['sourceFile']=='matrix-settled-240.json' for r in d['reports'] if r['pieces']==1500)
fresh1500=next(d['reports'][0] for d in post if d['sourceFile']=='isolated-1500-240.json')
assert orig1500['stateHashes']==fresh1500['stateHashes']

warnings=[
 'All timings are Node with real Cannon and production JavaScript but DOM/GPU stubs; they are not browser FPS, Chrome profiles, GPU timings or processor-utilization percentages.',
 'Matrix wall timing includes advanceSimulation, battery liquids, target and render preparation; it excludes other work in the browser frame/UI. process.cpuUsage measures the process, including internal threads, rather than only the main thread.',
 'At 30 samples, nearest-rank p99 is the maximum and p95 is the second-highest sample. These short windows do not establish a stable long-session tail percentile.',
 'The fixed camera does not see every body. Fixture rows extend from z=-5 toward positive z; growth in total pieces is not equal to growth in visible outlines. Counters report calls that survive group visibility separately from actual draw calls.',
 'Original 1500/240 matrix: median wall p50 worsens 61.724831 to 69.320638 ms; two of three paired p50 values worsen, and all three paired p95 values worsen. Inventories, complete state and clocks agree.',
 'Isolated fresh-process 1500/240 repeat keeps the same source/configuration/state and still has worse marginal medians 57.740004 to 69.064442 ms, although two of three individual p50 pairs improve. Both versions exhibit multiple performance regimes. Do not replace the original result, select favorable runs, or claim a verified global benefit for this scale; attribution remains unresolved.',
 'Original 16/120 short control: median p99 worsens 1.503531 to 4.471747 ms while p50/p95 improve. Keep this result. The separately identified 180-warm/180-sample follow-up improves every paired p99; it does not erase the original tail observation.',
 'Original 2000/120 has an individual pair whose optimized p50 worsens despite improved marginal medians. Report per-pair directions and ranges.',
 '2000/240 stopped during baseline warmup after 30 of 60 frames at 20.089486 seconds; no main timing comparison exists. The last fully completed scale at 240 Hz is 1500.',
 'The counter pass excludes renderer initialization uploads. The static 2592-byte box buffer replaces the unused 576-byte buffer, adding 2016 bytes of GPU payload per renderer, plus an optional VAO/binding entry. This is not measured process heap growth.',
 'Node Inspector CPU and allocation captures use separate fresh game instances. Their allocation samples are estimates, not exact allocation totals. GC event windows exclude explicit collections; forced-GC heap differences include harness/JIT/profiler effects and do not identify cache size.',
 'Inclusive phase timings are nested and must not be added. They are diagnostic runs, separate from the primary matrix and isolated-outline timings.',
 'Factory delayed-frame equivalence intentionally exercises existing limits: 0.25 simulated seconds are discarded by BOTH versions at each selected frequency. Normal camera tests and production runs discard zero.',
 'Production completion in equivalence is observed after a full advanceSimulation(1/60), unlike the prior physical-step terminal trace. Production20 at120Hz therefore records39.983333s here versus39.975s in that earlier trace, with unchanged A/B energy and outcomes.',
 'Control medians also include small worsenings: few-articulated500 p50 5.566118 to5.674449ms, many-mechanisms500 21.559380 to21.923086ms, factory2000 15.380368 to15.654045ms; independent2000 settling p50 238.652705 to241.181120ms. Preserve these results rather than claiming every scene benefits.',
 'The original optimization covers rendering preparation. These measurements do not establish a reduction of physics or GPU work, nor guarantee that every construction meets16.67ms.'
]
# Derive the short-control p99 warning from its exact record rather than rounded manual text.
short=next(r for d in main if d['sourceFile']=='matrix-settled-120.json' for r in d['reports'] if r['pieces']==16)
warnings[6]=f"Original 16/120 short control: median p99 worsens {short['variants']['baseline']['wallMs']['p99']['median']:.6f} to {short['variants']['optimized']['wallMs']['p99']['median']:.6f} ms while p50/p95 improve. Keep this result. The separately identified180-warm/180-sample follow-up improves every paired p99; it does not erase the original tail observation."

summary={
 'schema':1,
 'analysis':'Read-only aggregation of completed benchmark JSON; no benchmark or test execution and no production edits.',
 'generatedAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),
 'method':{'summaryStatistic':'median/min/max across repetitions, with original valuesByRepetition retained; individual paired deltas are included because marginal medians can cross between distinct performance regimes.','timingUnits':'milliseconds per simulated frame or per isolated outline operation as indicated by source mode','fullStateVerification':'Each runner already asserted exact complete baseline/optimized states before writing its JSON. This analysis verifies those flags, pair counts, hashes, inventories and clocks; raw complete states are not duplicated in the source reports.','budgetThreshold':'first tested scale whose median repetition p50/p95/p99 wall exceeds16.67ms; a partial Node workload, not a certified browser frame budget.'},
 'mainMatrices':main,'outlineOperations':outline,'outlineCounters':counts,'postchecks':post,'equivalence':equivalence,'profile':profile,'existingBenchmarks':existing,'warnings':warnings,
 'totals':{
  'mainMatrixCompletedConfigurations':sum(d['completedConfigurations'] for d in main),
  'mainMatrixExactPairs':sum(d['completedPairs'] for d in main),
  'isolatedOutlineExactPairs':outline['completedPairs'],
  'outlineCounterExactPairs':counts['completedPairs'],
  'postcheckExactPairs':sum(d['completedPairs'] for d in post),
  'productionAndCameraExactPairs':equivalence['completedPairs'],
  'totalRunnerExactPairs':sum(d['completedPairs'] for d in main)+outline['completedPairs']+counts['completedPairs']+sum(d['completedPairs'] for d in post)+equivalence['completedPairs'],
  'profileCapturePairsBetweenVersions':profile['capturePairsBetweenVersions'],
  'instrumentationPairsWithinVersions':profile['instrumentationPairsWithinVersions'],
  'architectureExactCases':existing.get('architecture',{}).get('comparisons'),
  'groundExactCases':existing.get('ground',{}).get('comparisons'),
  'mainMatrixMeasuredFramesBothVariants':sum(d['totalMeasuredFramesBothVariants'] for d in main),
  'mainMatrixMeasuredPhysicsStepsBothVariants':sum(d['totalMeasuredPhysicsStepsBothVariants'] for d in main),
  'mainMatrixMeasuredDroppedSecondsBothVariants':sum(d['totalMeasuredDroppedSecondsBothVariants'] for d in main),
  'mainMatrixStoppedConfigurations':[r for d in main for r in d['stoppedConfigurations']],
  'postcheckMatchesOriginal1500_240StateHashes':orig1500['stateHashes']==fresh1500['stateHashes']
 },'sourceFiles':inputs
}
path=ROOT/'analysis-summary.json';path.write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'output':str(path),'bytes':path.stat().st_size,'totals':summary['totals']},ensure_ascii=False))
