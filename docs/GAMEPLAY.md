# Gameplay & balancing

## Scoring

| Source             | Points                         |
| ------------------ | ------------------------------ |
| Height climbed     | 1 point per 6 px of max height |
| DLI coin           | +10 (and +1 DLI to the wallet) |
| Stomp a glitch bug | +50                            |
| Shoot a glitch bug | +30                            |

## Coin magnet (`MAGNET` in `src/config/constants.js`)

| Setting  | Value                                                                    |
| -------- | ------------------------------------------------------------------------ |
| Spawn    | 3.5% of decorated platforms, from 300 points on (never breaking ones)    |
| Limits   | At most one magnet waiting in the level, none while a magnet is active   |
| Duration | 8 s (HUD countdown; the field and badge blink during the last 2 s)       |
| Reach    | Coins within 260 px of the mascot's body are pulled in                   |
| Pull     | 3 200 px/s², up to 1 100 px/s, steered so coins home in instead of orbit |

Coins that are already flying keep coming after the magnet runs out.

## Dressing Room

| Skin          | Price   |
| ------------- | ------- |
| Classic       | Free    |
| Neon Wings    | 100 DLI |
| Golden Seraph | 200 DLI |
| Sunfire Angel | 250 DLI |
| Galaxy Nebula | 300 DLI |

Skins are cosmetic: the hitbox, physics and animations timings are the same
for every skin, and every skin does exactly the classic mascot's poses. Purchases are paid from the DLI wallet and, like the wallet,
are stored on the device (localStorage key `skins`).

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

Only what you can see counts: platforms, springs and monsters whose top is
below the bottom edge of the screen (minus `CAMERA.LANDING_MARGIN`, 6 px) can't
be landed on or hit, so once you fall off the screen you keep falling.

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
