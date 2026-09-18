'use client';
import { useEffect, useState } from 'react';
import { Users, LogIn, Loader2, X } from 'lucide-react';
import { orbitron } from '../lib/types';
import { MAX_NAME_LENGTH, MAX_PLAYERS } from '../lib/constants';
import { styles } from '../../styles/ricochet-styles';

const NAME_KEY = 'ricochet-player-name';

interface LobbyEntryProps {
    connected: boolean;
    restoring: boolean;
    notice: string | null;
    onDismissNotice: () => void;
    onCreate: (name: string) => void;
    onJoin: (code: string, name: string) => void;
}

export default function LobbyEntry({ connected, restoring, notice, onDismissNotice, onCreate, onJoin }: LobbyEntryProps) {
    const [name, setName] = useState('');
    const [code, setCode] = useState('');

    // Prefill from an invite link (?code=ABCDE) and the name used last time.
    useEffect(() => {
        const invited = new URLSearchParams(window.location.search).get('code');
        if (invited) setCode(invited.toUpperCase());
        try {
            setName(localStorage.getItem(NAME_KEY) ?? '');
        } catch {
            // Storage unavailable; start with an empty name.
        }
    }, []);

    const rememberName = () => {
        try {
            localStorage.setItem(NAME_KEY, name.trim());
        } catch {
            // Only a convenience.
        }
    };

    const ready = connected && !restoring && name.trim().length > 0;

    if (!connected || restoring) {
        return (
            <main className={styles.loadingContainer}>
                <div className="flex flex-col items-center gap-3 text-center p-4">
                    <Loader2 className={styles.loadingSpinner} />
                    <p className="text-xl">Connecting to the multiplayer server...</p>
                    <p className="text-sm text-slate-500 max-w-sm">The server sleeps when nobody is playing, so the first connection can take up to a minute.</p>
                </div>
            </main>
        );
    }

    return (
        <main className={styles.landingContainer}>
            <div className="w-full max-w-md flex flex-col gap-4">
                <h2 className={`${orbitron.className} text-2xl font-black text-center`}>Multiplayer</h2>
                {notice && (
                    <div className={styles.notice} role="alert">
                        <span>{notice}</span>
                        <button onClick={onDismissNotice} title="Dismiss"><X size={16} /></button>
                    </div>
                )}

                <div className={styles.panelCard}>
                    <label className={`${orbitron.className} text-lg block mb-2`} htmlFor="player-name">Your Name</label>
                    <input
                        id="player-name"
                        type="text"
                        maxLength={MAX_NAME_LENGTH}
                        placeholder="Enter a name..."
                        value={name}
                        onChange={e => setName(e.target.value)}
                        className={`${styles.input} w-full text-base`}
                    />
                </div>

                <div className={styles.panelCard}>
                    <h3 className={`${orbitron.className} text-lg mb-1`}>Create a Lobby</h3>
                    <p className="text-sm text-slate-500 mb-3">Start a lobby for up to {MAX_PLAYERS} players and share its code.</p>
                    <button
                        onClick={() => { rememberName(); onCreate(name); }}
                        disabled={!ready}
                        className={`${styles.buttonBase} ${styles.buttonGreen} ${styles.buttonDisabled} w-full`}
                    >
                        <Users size={20} /> Create Lobby
                    </button>
                </div>

                <form
                    className={styles.panelCard}
                    onSubmit={e => { e.preventDefault(); rememberName(); onJoin(code, name); }}
                >
                    <h3 className={`${orbitron.className} text-lg mb-3`}>Join a Lobby</h3>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            placeholder="Lobby code"
                            value={code}
                            onChange={e => setCode(e.target.value.toUpperCase())}
                            className={`${styles.input} flex-grow uppercase tracking-widest text-base`}
                        />
                        <button type="submit" disabled={!ready || !code.trim()} className={`${styles.buttonBase} ${styles.buttonBlue} ${styles.buttonDisabled} w-24`}>
                            <LogIn size={16} /> Join
                        </button>
                    </div>
                </form>
            </div>
        </main>
    );
}
