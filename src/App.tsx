import { useEffect, useState } from 'react';
import { BoardCanvas } from './components/BoardCanvas';
import { PhoneController } from './components/PhoneController';
import { TitleScreen } from './components/TitleScreen';
import { TVHud } from './components/TVHud';
import { TVLobby } from './components/TVLobby';
import { useGameStore } from './store/useGameStore';

export default function App() {
  const screen = useGameStore((s) => s.screen);
  const room = useGameStore((s) => s.room);
  const setScreen = useGameStore((s) => s.setScreen);
  const createRoom = useGameStore((s) => s.createRoom);
  const tryAutoReconnect = useGameStore((s) => s.tryAutoReconnect);

  const [initialPin, setInitialPin] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const joinPin = params.get('join');
    const autostart = params.get('autostart');

    if (joinPin) {
      const cleanPin = joinPin.trim().toUpperCase();
      setInitialPin(cleanPin);
      setScreen('controller');
      tryAutoReconnect(cleanPin).catch(() => {});
      return;
    }

    if (autostart === '1') {
      createRoom({
        mode: 'quick_play',
        hostName: 'Commander',
        hostColor: 'crimson',
        preset: 'random_balanced',
        victoryTarget: 10,
        botCount: 3,
      }).catch(() => {});
    }
  }, [createRoom, setScreen, tryAutoReconnect]);

  // Keep document.body.dataset.state synced with game lifecycle
  useEffect(() => {
    if (room?.game?.phase === 'finished') {
      document.body.dataset.state = 'gameover';
    } else if (screen === 'tv_game' || screen === 'controller') {
      document.body.dataset.state = 'playing';
    } else {
      document.body.dataset.state = 'title';
    }
  }, [screen, room?.game?.phase]);

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#0f1a24] select-none">
      {screen !== 'controller' && <BoardCanvas />}
      {screen === 'title' && <TitleScreen />}
      {screen === 'tv_lobby' && <TVLobby />}
      {screen === 'tv_game' && <TVHud />}
      {screen === 'controller' && <PhoneController initialPin={initialPin} />}
    </div>
  );
}
