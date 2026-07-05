"""Per-project SSE event bus (PLAN §3.3). Multi-subscriber fan-out via asyncio queues."""

import asyncio
from collections import defaultdict
from contextlib import contextmanager


class EventBus:
    def __init__(self) -> None:
        self._subscribers: dict[str, set[asyncio.Queue]] = defaultdict(set)

    @contextmanager
    def subscribe(self, project_id: str):
        queue: asyncio.Queue = asyncio.Queue(maxsize=1000)
        self._subscribers[project_id].add(queue)
        try:
            yield queue
        finally:
            self._subscribers[project_id].discard(queue)

    async def publish(self, project_id: str, event_type: str, data: dict) -> None:
        for queue in list(self._subscribers[project_id]):
            try:
                queue.put_nowait({"event": event_type, "data": data})
            except asyncio.QueueFull:
                pass  # slow consumer: drop rather than stall the turn


bus = EventBus()
