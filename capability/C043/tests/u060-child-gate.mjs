import { once } from 'node:events';

if (process.ppid === Number(process.env.C043_U060_PARENT_PID) && typeof process.send === 'function') {
  const token = process.env.C043_U060_START_TOKEN;
  if (!token) throw new Error('U060 child startup requires its caller token.');
  process.send({ type: 'u060-ready', token });
  for (;;) {
    const [message] = await once(process, 'message');
    if (message?.type === 'u060-start' && message.token === token) break;
  }
}
