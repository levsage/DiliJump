# Gameplay & balancing

## Scoring

| Source             | Points                         |
| ------------------ | ------------------------------ |
| Height climbed     | 1 point per 6 px of max height |
| DLI coin           | +10 (and +1 DLI to the wallet) |
| Stomp a glitch bug | +50                            |
| Shoot a glitch bug | +30                            |

## Player level

Every point you score is also **XP**, and all your runs add up — even the ones
that don't beat your best. Each level costs 500 XP more than the one before:

| Level      | 2     | 3     | 4     | 5     | 10     | 20      |
| ---------- | ----- | ----- | ----- | ----- | ------ | ------- |
| Total XP   | 1 000 | 2 500 | 4 500 | 7 000 | 27 000 | 104 500 |
| Next costs | 1 500 | 2 000 | 2 500 | 3 000 | 5 500  | 10 500  |

Your level is shown next to your name on the leaderboard for everyone to see.

## Physics (from `src/config/constants.js`)

| Constant           | Value      | Notes                                                    |
| ------------------ | ---------- | -------------------------------------------------------- |
| `GRAVITY`          | 2150 px/s² |                                                          |
| `JUMP_VELOCITY`    | −1010 px/s | Apex ≈ 237 px                                            |
| `SPRING_VELOCITY`  | −1650 px/s | Apex ≈ 633 px                                            |
| `PLATFORM.MAX_GAP` | 200 px     | Always below the jump apex, so every level can be beaten |

## Platforms

| Type      | Colour          | Behaviour                                                                            |
| --------- | --------------- | ------------------------------------------------------------------------------------ |
| Normal    | Green           | Solid                                                                                |
| Moving    | Blue            | Slides left and right, speeds up with score                                          |
| Breaking  | Brown, cracked  | Crumbles when you land on it. Placed only as a decoy **between** reachable platforms |
| Vanishing | White with logo | Works once, then fades away                                                          |

## Difficulty curve (`src/systems/Difficulty.js`)

Most parameters ramp from score 0 to 12,000, then hold steady:

- Platform gaps widen (up to `MAX_GAP`).
- Moving platforms appear from 500, vanishing platforms from 2,500.
- Breaking decoys: 5% → 30% chance.
- Glitch bugs appear from 1,200 (5% → 14% chance, up to 15k).
- Coin and spring chances stay the same.
