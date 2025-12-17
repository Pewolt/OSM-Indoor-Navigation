// Dijkstra Replay Logic implementation
export function initReplayState() {
    return {
        replayIndex: -1,
        currentReplayPath: [],
        currentDists: {},
        replayLines: []
    };
}
