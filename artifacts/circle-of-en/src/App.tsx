import { useState, useCallback, useEffect } from "react";
import "./index.css";
import {
  upsertSession,
  submitMessage,
  checkDailyLimit,
  fetchEn,
  fetchMessageCount,
  hasAvailableEn,
  fetchTags,
  type UserSession,
} from "./lib/supabase";
import { moderateEn } from "./lib/moderation";

type Screen =
  | "home"
  | "give"
  | "given"
  | "receive-tag"
  | "en"
  | "limit";


function getOrCreateUuid(): string {
  let id = localStorage.getItem("en-user-id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("en-user-id", id);
  }
  return id;
}

/* ══════════════════════════
   SVG LOGOS
══════════════════════════ */

function HeroLogo() {
  return (
    <div className="hero-logo">
      <svg viewBox="0 0 130 110" width="130" height="110" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M 76,24 C 95,31 98,49 97,61 C 96,84 80,100 54,100 C 28,100 12,84 12,61 C 12,49 16,31 34,24"
          stroke="#C07856" strokeWidth="2.2" strokeLinecap="round" fill="none"
        />
        <text x="55" y="24" fontFamily="'Pinyon Script', cursive" fontSize="22"
          fill="#C07856" textAnchor="middle" dominantBaseline="middle">of</text>
      </svg>
      <span className="hero-en">En.</span>
    </div>
  );
}

function NavLogo({ onClick }: { onClick: () => void }) {
  return (
    <div className="nav-logo" onClick={onClick}>
      <svg viewBox="0 0 160 55" width="120" height="42" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M 38,12 C 48,16 49,25 48,31 C 47,42 40,50 27,50 C 14,50 6,42 6,31 C 6,25 7,16 17,12"
          stroke="#C07856" strokeWidth="2" strokeLinecap="round" fill="none"
        />
        <text x="27" y="12" fontFamily="'Pinyon Script', cursive" fontSize="11"
          fill="#C07856" textAnchor="middle" dominantBaseline="middle">of</text>
        <text x="60" y="33" fontFamily="'Cormorant Garamond', Georgia, serif"
          fontSize="28" fontWeight="400" fill="#2C2825" dominantBaseline="middle">En.</text>
      </svg>
    </div>
  );
}

function CircleSvgLarge() {
  return (
    <svg viewBox="0 0 110 110" width="88" height="88" xmlns="http://www.w3.org/2000/svg">
      <g className="confirm-circle-wrap">
        <path
          className="confirm-circle-path"
          d="M 76,24 C 95,31 98,49 97,61 C 96,84 80,100 54,100 C 28,100 12,84 12,61 C 12,49 16,31 34,24"
          stroke="#C07856" strokeWidth="2.2" strokeLinecap="round" fill="none"
        />
      </g>
    </svg>
  );
}

function CircleSvgMuted() {
  return (
    <svg viewBox="0 0 110 110" width="72" height="72" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M 76,24 C 95,31 98,49 97,61 C 96,84 80,100 54,100 C 28,100 12,84 12,61 C 12,49 16,31 34,24"
        stroke="#C07856" strokeWidth="2.2" strokeLinecap="round" fill="none"
      />
    </svg>
  );
}

/* ══════════════════════════
   SCREEN: HOME
══════════════════════════ */

function HomeScreen({ onGive, onFind, session, messageCount, enAvailable }: {
  onGive: () => void;
  onFind: () => void;
  session: UserSession | null;
  messageCount: number | null;
  enAvailable: boolean;
}) {
  const given = session?.given_count ?? 0;
  const received = session?.received_count ?? 0;
  const canReceive = (received === 0 || given > received) && enAvailable;

  return (
    <div className="screen">
      <div className="nav" />
      <div className="hero">
        <HeroLogo />
        <p className="hero-line">What held you once will hold somebody through theirs.</p>
        <div className="hero-actions">
          {received === 0 ? (
            <button className="btn-primary" onClick={onFind}>Receive your En</button>
          ) : (
            <>
              <button className="btn-primary" onClick={onGive}>Leave an En</button>
              {canReceive && (
                <button className="find-link" onClick={onFind}>
                  somebody left something for you <em>→</em>
                </button>
              )}
            </>
          )}
        </div>
      </div>
      <div className="home-footer">
        {messageCount != null && messageCount > 0 && (
          <>
            <span className="home-footer-count">{messageCount.toLocaleString()} in the circle</span>
            <span className="home-footer-sep">|</span>
          </>
        )}
        <a className="about-link-inline" href="https://circleofen.com/about.html">about the circle</a>
      </div>
      <div className="spacer-bottom" />
    </div>
  );
}

/* ══════════════════════════
   SCREEN: LEAVE AN EN
══════════════════════════ */

function GiveScreen({ onBack, onSubmit, loading, moderationError, onClearError, tags }: {
  onBack: () => void;
  onSubmit: (text: string, tags: string[]) => void;
  loading: boolean;
  moderationError: boolean;
  onClearError: () => void;
  tags: string[];
}) {
  const [text, setText] = useState("");
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const MAX = 400;

  const toggleTag = (tag: string) => {
    setActiveTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    if (moderationError) onClearError();
  };

  const handleSubmit = () => {
    if (!text.trim() || loading) return;
    onSubmit(text.trim(), activeTags);
  };

  return (
    <div className="screen">
      <div className="nav">
        <NavLogo onClick={onBack} />
      </div>
      <div className="screen-inner">
        <button className="back-btn" onClick={onBack}>← back</button>
        <h2 className="screen-title">What are you carrying today?</h2>
        <p className="screen-desc">Someone else might arrive here tomorrow carrying what you once carried.</p>

        <div className="tags-wrap">
          {tags.map(tag => (
            <span
              key={tag}
              className={`tag-chip${activeTags.includes(tag) ? " active" : ""}`}
              onClick={() => toggleTag(tag)}
            >{tag}</span>
          ))}
        </div>

        <div className="text-area-wrap">
          <textarea
            value={text}
            onChange={handleTextChange}
            maxLength={MAX}
            placeholder="What do you wish someone told you in this moment…"
          />
          <span className="char-count">{MAX - text.length} characters left</span>
        </div>

        {moderationError && (
          <p className="moderation-error">
            The circle asks for something a little different — not advice, but the truth of a moment you've lived. Try again when you're ready.
          </p>
        )}

        <button
          className="btn-primary"
          onClick={handleSubmit}
          style={{ opacity: loading ? 0.6 : undefined }}
        >
          {loading ? "Reviewing…" : "Offer this En"}
        </button>
      </div>
      <div className="spacer-bottom" />
    </div>
  );
}

/* ══════════════════════════
   SCREEN: CONFIRMED
══════════════════════════ */

function GivenScreen({ onFind, onHome }: {
  onFind: () => void;
  onHome: () => void;
}) {
  return (
    <div className="screen">
      <div className="confirm-center">
        <div className="confirm-mark"><CircleSvgLarge /></div>
        <h2 className="confirm-headline">your En is in the circle</h2>
        <p className="confirm-sub">Someone is on their way to this moment. They just don't know it yet.</p>
        <div className="confirm-actions">
          <button className="btn-primary" onClick={onFind}>Find my En</button>
          <button className="btn-ghost" onClick={onHome}>return home</button>
        </div>
      </div>
      <div className="spacer-bottom" />
    </div>
  );
}

/* ══════════════════════════
   SCREEN: FIND AN EN
══════════════════════════ */

function ReceiveTagScreen({ onBack, onOpen, onRandom, loading, tags }: {
  onBack: () => void;
  onOpen: (tag: string | null) => void;
  onRandom: () => void;
  loading: boolean;
  tags: string[];
}) {
  const [activeTag, setActiveTag] = useState<string | null>(null);

  return (
    <div className="screen">
      <div className="nav">
        <NavLogo onClick={onBack} />
      </div>
      <div className="screen-inner">
        <button className="back-btn" onClick={onBack}>← back</button>
        <h2 className="screen-title">Where are you today?</h2>
        <p className="screen-desc">Someone once stood here too.</p>

        <div className="tags-wrap">
          {tags.map(tag => (
            <span
              key={tag}
              className={`tag-chip${activeTag === tag ? " active" : ""}`}
              onClick={() => setActiveTag(prev => prev === tag ? null : tag)}
            >{tag}</span>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <button
            className="btn-primary"
            onClick={() => onOpen(activeTag)}
            style={{ opacity: loading ? 0.6 : undefined }}
          >
            {loading ? "Finding your En…" : "Open my En"}
          </button>
          <button className="btn-secondary" onClick={onRandom} disabled={loading}>
            let the circle decide
          </button>
        </div>
      </div>
      <div className="spacer-bottom" />
    </div>
  );
}

/* ══════════════════════════
   SCREEN: EN ARRIVES
══════════════════════════ */

function EnScreen({ onHome, enText, isEmpty }: {
  onHome: () => void;
  enText: string;
  isEmpty: boolean;
}) {
  if (isEmpty) {
    return (
      <div className="screen">
        <div className="nav">
          <NavLogo onClick={onHome} />
        </div>
        <div className="confirm-center">
          <div className="confirm-mark" style={{ opacity: 0.35 }}>
            <CircleSvgLarge />
          </div>
          <h2 className="confirm-headline" style={{ fontStyle: "italic" }}>still gathering</h2>
          <p className="confirm-sub">
            The circle is still gathering. Be the first to leave an En for this moment.
          </p>
          <div className="confirm-actions">
            <button className="btn-primary" onClick={onHome}>return to the circle</button>
          </div>
        </div>
        <div className="spacer-bottom" />
      </div>
    );
  }

  return (
    <div className="screen">
      <div className="nav">
        <NavLogo onClick={onHome} />
      </div>
      <div className="screen-inner-center">
        <span className="en-found-you">an En found you…</span>
        <div className="en-card">
          <p className="en-message">{enText}</p>
        </div>
        <div className="en-actions">
          <button className="btn-primary" onClick={onHome}>Carry this with me</button>
          <button className="btn-ghost" onClick={onHome}>return home</button>
        </div>
      </div>
      <div className="spacer-bottom" />
    </div>
  );
}

/* ══════════════════════════
   SCREEN: DAILY LIMIT
══════════════════════════ */

function LimitScreen({ onGive, onHome }: {
  onGive: () => void;
  onHome: () => void;
}) {
  return (
    <div className="screen">
      <div className="limit-center">
        <div className="limit-mark"><CircleSvgMuted /></div>
        <h2 className="limit-headline">let this one settle</h2>
        <p className="limit-sub">The circle will be here for you tomorrow. Some things take a little time to land.</p>
        <div className="limit-actions">
          <button className="btn-primary" onClick={onGive}>Leave an En instead</button>
          <button className="btn-ghost" onClick={onHome}>return home</button>
        </div>
      </div>
      <div className="spacer-bottom" />
    </div>
  );
}

/* ══════════════════════════
   ROOT APP
══════════════════════════ */

export default function App() {
  const [uuid] = useState<string>(() => getOrCreateUuid());
  const [session, setSession] = useState<UserSession | null>(null);
  const [screen, setScreen] = useState<Screen>("home");
  const [currentEnText, setCurrentEnText] = useState<string>("");
  const [enIsEmpty, setEnIsEmpty] = useState(false);
  const [loading, setLoading] = useState(false);
  const [moderationError, setModerationError] = useState(false);
  const [messageCount, setMessageCount] = useState<number | null>(null);
  const [enAvailable, setEnAvailable] = useState(false);
  const [tags, setTags] = useState<string[]>([]);

  useEffect(() => {
    upsertSession(uuid).then(s => setSession(s));
    fetchMessageCount().then(n => setMessageCount(n));
    hasAvailableEn(uuid).then(setEnAvailable);
    fetchTags().then(setTags);
  }, [uuid]);

  const goTo = useCallback((s: Screen) => {
    window.scrollTo(0, 0);
    setScreen(s);
  }, []);

  const handleGiveSubmit = async (text: string, tags: string[]) => {
    setLoading(true);
    setModerationError(false);

    const result = await moderateEn(text);
    if (!result.approved) {
      setModerationError(true);
      setLoading(false);
      return;
    }

    const tag = tags[0] ?? "";
    const ok = await submitMessage(text, tag, uuid, "approved");
    if (ok) {
      const [updated, newCount, available] = await Promise.all([
        upsertSession(uuid),
        fetchMessageCount(),
        hasAvailableEn(uuid),
      ]);
      setSession(updated);
      setMessageCount(newCount);
      setEnAvailable(available);
    }
    setLoading(false);
    goTo("given");
  };

  const handleReceiveEn = async (tag: string | null) => {
    setLoading(true);

    const atLimit = await checkDailyLimit(uuid);
    if (atLimit) {
      setLoading(false);
      goTo("limit");
      return;
    }

    const message = await fetchEn(uuid, tag);
    if (message) {
      setCurrentEnText(message.content);
      setEnIsEmpty(false);
      const updated = await upsertSession(uuid);
      setSession(updated);
    } else {
      setCurrentEnText("");
      setEnIsEmpty(true);
    }

    setLoading(false);
    goTo("en");
  };

  return (
    <div className="app">
      {screen === "home" && (
        <HomeScreen
          onGive={() => goTo("give")}
          onFind={() => goTo("receive-tag")}
          session={session}
          messageCount={messageCount}
          enAvailable={enAvailable}
        />
      )}
      {screen === "give" && (
        <GiveScreen
          onBack={() => goTo("home")}
          onSubmit={handleGiveSubmit}
          loading={loading}
          moderationError={moderationError}
          onClearError={() => setModerationError(false)}
          tags={tags}
        />
      )}
      {screen === "given" && (
        <GivenScreen
          onFind={() => goTo("receive-tag")}
          onHome={() => goTo("home")}
        />
      )}
      {screen === "receive-tag" && (
        <ReceiveTagScreen
          onBack={() => goTo("home")}
          onOpen={handleReceiveEn}
          onRandom={() => handleReceiveEn(null)}
          loading={loading}
          tags={tags}
        />
      )}
      {screen === "en" && (
        <EnScreen
          onHome={() => goTo("home")}
          enText={currentEnText}
          isEmpty={enIsEmpty}
        />
      )}
      {screen === "limit" && (
        <LimitScreen
          onGive={() => goTo("give")}
          onHome={() => goTo("home")}
        />
      )}
    </div>
  );
}
