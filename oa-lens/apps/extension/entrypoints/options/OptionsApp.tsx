import { useEffect, useState } from 'preact/hooks';
import { summarizeHealth, type CheckState, type HealthSummary } from '../../lib/healthSummary';
import { send } from '../../lib/messages';
import { normalizeWorkerUrl, sharedKeyItem, workerUrlItem } from '../../lib/settings';

const STATE_STYLE: Record<CheckState, { icon: string; color: string }> = {
  ok: { icon: '✓', color: 'oal-text-green-700' },
  warn: { icon: '!', color: 'oal-text-amber-600' },
  fail: { icon: '✗', color: 'oal-text-red-700' },
};

export function OptionsApp() {
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const [testing, setTesting] = useState(false);
  const [summary, setSummary] = useState<HealthSummary | null>(null);

  useEffect(() => {
    void Promise.all([workerUrlItem.getValue(), sharedKeyItem.getValue()]).then(([u, k]) => {
      setUrl(u);
      setKey(k);
    });
  }, []);

  async function save(): Promise<boolean> {
    const normalized = normalizeWorkerUrl(url);
    if (!normalized) {
      setNotice({
        text: 'Worker URL 형식이 올바르지 않습니다 (예: https://oa-lens.<계정>.workers.dev)',
        error: true,
      });
      return false;
    }
    if (!key.trim()) {
      setNotice({ text: '공유키(EXT_SHARED_KEY)를 입력하세요', error: true });
      return false;
    }
    await Promise.all([workerUrlItem.setValue(normalized), sharedKeyItem.setValue(key.trim())]);
    setUrl(normalized);
    setNotice({ text: '저장했습니다' });
    return true;
  }

  async function test() {
    if (!(await save())) return;
    setTesting(true);
    setSummary(null);
    try {
      setSummary(summarizeHealth(await send({ type: 'health', deep: true })));
    } finally {
      setTesting(false);
    }
  }

  return (
    <main class="oal-mx-auto oal-max-w-xl oal-p-6 oal-font-sans oal-text-[14px] oal-text-gray-900">
      <h1 class="oal-mb-1 oal-text-xl oal-font-bold">OA Lens 설정</h1>
      <p class="oal-mb-5 oal-text-gray-600">
        Cloudflare Worker 주소와 공유키를 입력하세요. 값은 이 기기의 Chrome에만 저장됩니다.
      </p>

      <form
        class="oal-space-y-4 oal-rounded-lg oal-border oal-border-gray-200 oal-bg-white oal-p-4"
        onSubmit={(e) => {
          e.preventDefault();
          void test();
        }}
      >
        <label class="oal-block">
          <span class="oal-mb-1 oal-block oal-font-semibold">Worker URL</span>
          <input
            type="url"
            name="workerUrl"
            class="oal-w-full oal-rounded oal-border oal-border-gray-300 oal-px-2 oal-py-1.5"
            placeholder="https://oa-lens.<계정>.workers.dev"
            value={url}
            onInput={(e) => setUrl(e.currentTarget.value)}
            autoComplete="off"
          />
        </label>

        <label class="oal-block">
          <span class="oal-mb-1 oal-block oal-font-semibold">공유키 (EXT_SHARED_KEY)</span>
          <div class="oal-flex oal-gap-2">
            <input
              type={showKey ? 'text' : 'password'}
              name="sharedKey"
              class="oal-w-full oal-rounded oal-border oal-border-gray-300 oal-px-2 oal-py-1.5 oal-font-mono"
              value={key}
              onInput={(e) => setKey(e.currentTarget.value)}
              autoComplete="off"
            />
            <button
              type="button"
              class="oal-shrink-0 oal-rounded oal-border oal-border-gray-300 oal-px-3 hover:oal-bg-gray-100"
              onClick={() => setShowKey((v) => !v)}
            >
              {showKey ? '숨기기' : '보기'}
            </button>
          </div>
        </label>

        <div class="oal-flex oal-items-center oal-gap-2">
          <button
            type="button"
            class="oal-rounded oal-border oal-border-gray-300 oal-px-4 oal-py-1.5 hover:oal-bg-gray-100"
            onClick={() => void save()}
          >
            저장
          </button>
          <button
            type="submit"
            class="oal-rounded oal-bg-gray-900 oal-px-4 oal-py-1.5 oal-text-white hover:oal-bg-gray-700 disabled:oal-opacity-50"
            disabled={testing}
          >
            {testing ? '테스트 중…' : '연결 테스트'}
          </button>
          {notice && (
            <span class={notice.error ? 'oal-text-red-700' : 'oal-text-gray-600'} role="status">
              {notice.text}
            </span>
          )}
        </div>
      </form>

      {summary && (
        <section
          class="oal-mt-4 oal-rounded-lg oal-border oal-border-gray-200 oal-bg-white oal-p-4"
          data-testid="health-result"
        >
          <p
            class={`oal-mb-3 oal-text-[15px] oal-font-bold ${summary.ok ? 'oal-text-green-700' : 'oal-text-red-700'}`}
            data-testid="health-headline"
          >
            {summary.headline}
          </p>
          <ul class="oal-space-y-1">
            {summary.lines.map((line) => {
              const style = STATE_STYLE[line.state];
              return (
                <li key={line.label} class="oal-flex oal-gap-2">
                  <span class={`oal-w-4 oal-font-bold ${style.color}`}>{style.icon}</span>
                  <span class="oal-w-28 oal-shrink-0 oal-text-gray-600">{line.label}</span>
                  <span class="oal-min-w-0 oal-break-words">{line.detail}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </main>
  );
}
