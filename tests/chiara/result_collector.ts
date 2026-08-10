export type TestCategory = 'A_CORE_BOOKING' | 'B_CUSTOMER_RECOGNITION' | 'C_IDENTITY_SECURITY' | 'D_CALENDAR_AVAILABILITY' | 'E_FAQ' | 'F_NATURAL_LANGUAGE' | 'G_ADVERSARIAL';
export type TestClassification = 'CORE_MVP' | 'FUTURE_FEATURE' | 'NOT_CONFIGURED';
export type TestStatus = 'PASS' | 'FAIL' | 'BLOCKED_BY_ENVIRONMENT' | 'NOT_CONFIGURED_SAFE' | 'NOT_CONFIGURED_HALLUCINATION' | 'FUTURE_FEATURE_UNSUPPORTED';

export interface TestResult {
    id: string;
    category: TestCategory;
    classification: TestClassification;
    status: TestStatus;
    input: string;
    context?: string;
    expectedBehavior: string;
    actualBehavior?: string;
    toolsCalled?: string[];
    databaseEffect?: string;
    likelyRootCause?: string;
    affectedModule?: string;
    securityRisk?: boolean;
    pilotBlocker?: boolean;
}

export class TestResultCollector {
    private results: TestResult[] = [];

    addResult(result: TestResult) {
        this.results.push(result);
    }

    getResults() {
        return this.results;
    }
}
