import tape from 'tape';
import {
  solve4plCurve,
  solveParallelism,
  solveZFactor,
  solveParsePlateStream,
  solveResolveEntity,
  solveDetectOutliers,
  solveCalculateLodLoq,
  solveNormalizeDilution,
  solveExportCdiscSdtm,
  solveGenerateGxpAuditLog
} from '../src/tools.js';

tape('Tool 1: 4PL Curve Fitting', (t) => {
  const res = solve4plCurve({
    concentrations: [0.1, 1.0, 10.0],
    responses: [5, 50, 95]
  });
  t.equal(res.status, 'SUCCESS');
  t.equal(res.parameters.top, 100);
  t.end();
});

tape('Tool 2: Assess Parallelism (F-Test & TOST)', (t) => {
  const res = solveParallelism({
    reference_responses: [10, 20, 30, 40],
    test_responses: [10.5, 20.2, 29.8, 40.1]
  });
  t.equal(res.status, 'COMPLETED');
  t.equal(res.parallelism_confirmed, true);
  t.end();
});

tape('Tool 3: Z-Factor High-Throughput Screening', (t) => {
  const res = solveZFactor({
    positive_controls: [100, 102, 98, 101],
    negative_controls: [5, 6, 4, 5]
  });
  t.equal(res.status, 'SUCCESS');
  t.ok(res.z_factor > 0.5, 'Z-Factor should be greater than 0.5 for excellent HTS assay');
  t.end();
});

tape('Tool 4: Stream Parser for Large Plates', (t) => {
  const res = solveParsePlateStream({
    plate_layout_csv: '10,20,30\n40,50,60',
    format_wells: '96'
  });
  t.equal(res.status, 'STREAM_PARSED');
  t.equal(res.total_wells_detected, 6);
  t.end();
});

tape('Tool 5: Resolve Biological Entity (Circuit Breaker)', async (t) => {
  const res = await solveResolveEntity({
    compound_name: 'Aspirin',
    target_database: 'PUBCHEM'
  });
  t.equal(res.status, 'RESOLVED');
  t.equal(res.entity.cid, '2244');
  t.end();
});

tape('Tool 6: Detect Assay Outliers (IQR Filtering)', (t) => {
  const res = solveDetectOutliers({
    replicate_values: [10, 10.2, 9.9, 10.1, 50.0],
    method: 'IQR'
  });
  t.equal(res.status, 'COMPLETED');
  t.equal(res.outliers_detected_count, 1);
  t.end();
});

tape('Tool 7: LOD & LOQ Calculation', (t) => {
  const res = solveCalculateLodLoq({
    blank_responses: [0.01, 0.02, 0.015, 0.012],
    slope: 1.5
  });
  t.equal(res.status, 'SUCCESS');
  t.ok(res.lod > 0);
  t.ok(res.loq > res.lod);
  t.end();
});

tape('Tool 8: Normalize Dilution Potency', (t) => {
  const res = solveNormalizeDilution({
    observed_concentration: 50.0,
    dilution_factor: 10.0,
    stock_unit: 'mg/mL'
  });
  t.equal(res.status, 'NORMALIZED');
  t.equal(res.calculated_stock_concentration, 500.0);
  t.end();
});

tape('Tool 9: CDISC SDTM Export', (t) => {
  const res = solveExportCdiscSdtm({
    study_id: 'SEOSIRI-STUDY-01',
    subject_id: 'PATient-99',
    domain: 'LB',
    test_code: 'GLUC',
    numeric_result: 95.5,
    result_unit: 'mg/dL'
  });
  t.equal(res.status, 'EXPORTED_CDISC_SDTM');
  t.equal(res.sdtm_record.STUDYID, 'SEOSIRI-STUDY-01');
  t.end();
});

tape('Tool 10: FDA 21 CFR Part 11 GxP Audit Trail', (t) => {
  const res = solveGenerateGxpAuditLog({
    operator_id: 'OP-402',
    action_performed: 'APPROVE_BIOASSAY_RUN',
    resource_target: 'RUN_8829'
  });
  t.equal(res.status, 'LOGGED_MUTABLE_HASH');
  t.ok(res.audit_record.immutable_sha256_hash.length === 64);
  t.end();
});