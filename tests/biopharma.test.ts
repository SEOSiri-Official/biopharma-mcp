import tape from 'tape';
import {
  solve4plCurve,
  solveZFactor,
  solveCalculateLodLoq,
  solveExportCdiscSdtm,
  solveGenerateGxpAuditLog
} from '../src/tools.js';

tape('Biopharma Tool 1: 4PL Curve Fitting', (t) => {
  const res = solve4plCurve({
    concentrations: [0.1, 1.0, 10.0],
    responses: [5, 50, 95]
  });
  t.equal(res.status, 'SUCCESS');
  t.equal(res.parameters.top, 100);
  t.end();
});

tape('Biopharma Tool 3: Z-Factor High-Throughput Screening', (t) => {
  const res = solveZFactor({
    positive_controls: [100, 102, 98, 101],
    negative_controls: [5, 6, 4, 5]
  });
  t.equal(res.status, 'SUCCESS');
  t.ok(res.z_factor > 0.5, 'Z-Factor should be greater than 0.5 for excellent HTS assay');
  t.end();
});

tape('Biopharma Tool 7: LOD & LOQ Calculation', (t) => {
  const res = solveCalculateLodLoq({
    blank_responses: [0.01, 0.02, 0.015, 0.012],
    slope: 1.5
  });
  t.equal(res.status, 'SUCCESS');
  t.ok(res.lod > 0);
  t.ok(res.loq > res.lod);
  t.end();
});

tape('Biopharma Tool 9: CDISC SDTM Export', (t) => {
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

tape('Biopharma Tool 10: FDA 21 CFR Part 11 GxP Audit Trail', (t) => {
  const res = solveGenerateGxpAuditLog({
    operator_id: 'OP-402',
    action_performed: 'APPROVE_BIOASSAY_RUN',
    resource_target: 'RUN_8829'
  });
  t.equal(res.status, 'LOGGED_MUTABLE_HASH');
  t.ok(res.audit_record.immutable_sha256_hash.length === 64);
  t.end();
});
