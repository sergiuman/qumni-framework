import { useState, useEffect } from 'react';
import { PlayerScreen } from './player/PlayerScreen';
import { JoinScreen } from './player/JoinScreen';
import { HostConsole } from './host/HostConsole';
import { DebriefView } from './debrief/DebriefView';

export function App() {
  const [route, setRoute] = useState(window.location.pathname);
  const [playerToken, setPlayerToken] = useState<string | null>(
    localStorage.getItem('qumni_player_token')
  );

  useEffect(() => {
    const onLocationChange = () => setRoute(window.location.pathname);
    window.addEventListener('popstate', onLocationChange);
    return () => window.removeEventListener('popstate', onLocationChange);
  }, []);

  // Parse path: /j/<code>
  const joinMatch = route.match(/^\/j\/([A-Za-z0-9]+)/);
  // Parse path: /lab/r/<id>
  const debriefMatch = route.match(/^\/lab\/r\/([A-Za-z0-9-]+)/);

  // Host console route
  if (route.startsWith('/lab/host')) {
    return <HostConsole />;
  }

  // Debrief view route
  if (debriefMatch) {
    const runId = debriefMatch[1];
    return <DebriefView runId={runId} />;
  }

  // Player route (/j/<code>, /lab/play, or root)
  if (joinMatch) {
    const code = joinMatch[1].toUpperCase();
    return (
      <JoinScreen
        initialJoinCode={code}
        onJoined={(data) => {
          setPlayerToken(data.playerToken);
          window.history.pushState({}, '', '/lab/play');
          setRoute('/lab/play');
        }}
      />
    );
  }

  if (!playerToken) {
    return (
      <JoinScreen
        onJoined={(data) => {
          setPlayerToken(data.playerToken);
          window.history.pushState({}, '', '/lab/play');
          setRoute('/lab/play');
        }}
      />
    );
  }

  return (
    <PlayerScreen
      playerToken={playerToken}
      onLogout={() => {
        localStorage.removeItem('qumni_player_token');
        setPlayerToken(null);
      }}
    />
  );
}
