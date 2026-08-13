import fs from 'fs';
import path from 'path';
import { TestResult, TestCategory } from './result_collector';

export function generateReport(results: TestResult[], baselineInfo: string) {
    const total = results.length;
    
    // Core MVP stats
    const coreMVP = results.filter(r => r.classification === 'CORE_MVP');
    const corePassed = coreMVP.filter(r => r.status === 'PASS').length;
    const coreFailed = coreMVP.filter(r => r.status === 'FAIL').length;
    const coreBlocked = coreMVP.filter(r => r.status === 'BLOCKED_BY_ENVIRONMENT').length;
    
    // Future feature stats
    const futureFeature = results.filter(r => r.classification === 'FUTURE_FEATURE');
    const futureSupported = futureFeature.filter(r => r.status === 'PASS').length;
    const futureNotImplemented = futureFeature.filter(r => r.status === 'FUTURE_FEATURE_UNSUPPORTED' || r.status === 'FAIL').length;
    const futureBlocked = futureFeature.filter(r => r.status === 'BLOCKED_BY_ENVIRONMENT').length;
    
    // Not configured stats
    const notConfigured = results.filter(r => r.classification === 'NOT_CONFIGURED');
    const notConfiguredSafe = notConfigured.filter(r => r.status === 'NOT_CONFIGURED_SAFE').length;
    const notConfiguredHallucinated = notConfigured.filter(r => r.status === 'NOT_CONFIGURED_HALLUCINATION').length;
    const notConfiguredBlocked = notConfigured.filter(r => r.status === 'BLOCKED_BY_ENVIRONMENT').length;
    
    // Pass rates
    function getCategoryStats(category: TestCategory | 'ALL') {
       const catResults = coreMVP.filter(r => r.category === category || category === 'ALL');
       const totalInCat = catResults.length;
       const passed = catResults.filter(r => r.status === 'PASS').length;
       const failed = catResults.filter(r => r.status === 'FAIL').length;
       const blocked = catResults.filter(r => r.status === 'BLOCKED_BY_ENVIRONMENT').length;
       
       return { total: totalInCat, passed, failed, blocked };
    }

    function calculatePassRate(category: TestCategory) {
       const stats = getCategoryStats(category);
       if (stats.total === 0) return 'NOT TESTED (0 scenarios)';
       if (stats.blocked === stats.total) return 'BLOCKED_BY_ENVIRONMENT';
       const executed = stats.passed + stats.failed;
       return `${((stats.passed / executed) * 100).toFixed(1)}% (${stats.passed}/${executed}) [${stats.blocked} blocked]`;
    }

    // Critical categories check
    const catA = getCategoryStats('A_CORE_BOOKING');
    const catB = getCategoryStats('B_CUSTOMER_RECOGNITION');
    const catC = getCategoryStats('C_IDENTITY_SECURITY');
    const catD = getCategoryStats('D_CALENDAR_AVAILABILITY');
    const catE = getCategoryStats('E_FAQ');
    const catF = getCategoryStats('F_NATURAL_LANGUAGE');
    
    const automatedRegressionPassed =
       (catC.total > 0 && catC.passed > 0 && catC.failed === 0) && // Identity Security 100%
       (catD.total > 0 && catD.passed > 0 && catD.failed === 0) && // Calendar 100%
       (catB.total > 0 && catB.passed > 0 && catB.failed === 0) && // Customer Association 100%
       (catA.total > 0 && catA.passed > 0 && catA.failed === 0) && // Booking Happy Path 100%
       (catE.passed / Math.max(1, catE.passed + catE.failed) >= 0.95) && // Configured info >= 95%
       (catF.passed / Math.max(1, catF.passed + catF.failed) >= 0.90) && // NLP >= 90%
       notConfiguredHallucinated === 0;

    let finalDecision = automatedRegressionPassed
        ? 'AUTOMATED REGRESSION PASS — HUMAN ACCEPTANCE PENDING'
        : 'AUTOMATED REGRESSION FAIL';

    if (catC.blocked === catC.total || catC.total === 0 ||
        catD.blocked === catD.total || catD.total === 0 ||
        catB.blocked === catB.total || catB.total === 0 ||
        catA.blocked === catA.total || catA.total === 0) {
        finalDecision = 'BENCHMARK INCOMPLETE — ENVIRONMENT BLOCKED';
    }
    
    const failures = results.filter(r => r.status === 'FAIL' || r.status === 'NOT_CONFIGURED_HALLUCINATION');
    const blockers = failures.filter(r => r.pilotBlocker);
    const rootCauses: Record<string, string[]> = {};
    blockers.forEach(b => {
        const cause = b.likelyRootCause || 'Unknown / Uncategorized Failure';
        if (!rootCauses[cause]) rootCauses[cause] = [];
        rootCauses[cause].push(b.id);
    });

    let report = `
# CHIARA TEST REPORT

## BASELINE
${baselineInfo}

## TEST SUMMARY
**Total scenarios:** ${total}

### CORE_MVP
- Total: ${coreMVP.length}
- Passed: ${corePassed}
- Failed: ${coreFailed}
- Blocked by environment: ${coreBlocked}

### FUTURE_FEATURE
- Total: ${futureFeature.length}
- Currently supported: ${futureSupported}
- Not implemented: ${futureNotImplemented}
- Blocked: ${futureBlocked}

### NOT_CONFIGURED
- Total: ${notConfigured.length}
- Safe responses: ${notConfiguredSafe}
- Hallucinated responses: ${notConfiguredHallucinated}
- Blocked: ${notConfiguredBlocked}

## CATEGORY RESULTS (CORE MVP PASS RATES)
- Booking (Category A): ${calculatePassRate('A_CORE_BOOKING')}
- Customer recognition (Category B): ${calculatePassRate('B_CUSTOMER_RECOGNITION')}
- Identity security (Category C): ${calculatePassRate('C_IDENTITY_SECURITY')}
- Calendar (Category D): ${calculatePassRate('D_CALENDAR_AVAILABILITY')}
- FAQ (Category E): ${calculatePassRate('E_FAQ')}
- Natural language (Category F): ${calculatePassRate('F_NATURAL_LANGUAGE')}
- Adversarial/ambiguous input (Category G): ${calculatePassRate('G_ADVERSARIAL')}

## FAILURE DETAILS
`;

    failures.forEach(f => {
       report += `
### TEST ID: ${f.id}
- **CATEGORY:** ${f.category}
- **INPUT:** "${f.input}"
${f.context ? `- **CONTEXT:** ${f.context}\n` : ''}
- **EXPECTED BEHAVIOR:** ${f.expectedBehavior}
- **ACTUAL BEHAVIOR:** ${f.actualBehavior || 'N/A'}
- **TOOLS CALLED:** ${f.toolsCalled ? f.toolsCalled.join(', ') : 'None'}
- **DATABASE EFFECT:** ${f.databaseEffect || 'Unknown/None'}
- **LIKELY ROOT CAUSE:** ${f.likelyRootCause || 'Unknown'}
- **AFFECTED MODULE:** ${f.affectedModule || 'Unknown'}
- **SECURITY RISK:** ${f.securityRisk ? 'YES' : 'NO'}
- **PILOT BLOCKER:** ${f.pilotBlocker ? 'YES' : 'NO'}
`;
    });

    report += `
## CRITICAL BLOCKERS (Grouped by Root Cause)
`;
    if (Object.keys(rootCauses).length === 0) {
        report += "None.\n";
    } else {
        for (const [cause, tests] of Object.entries(rootCauses)) {
            report += `- **${cause}** (Tests affected: ${tests.join(', ')})\n`;
        }
    }
    
    report += `
## FINAL GO / NO-GO
**${finalDecision}**
`;

    fs.writeFileSync(path.join(__dirname, '..', '..', 'CHIARA_TEST_REPORT.md'), report.trim());
}
