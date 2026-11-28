# Controls

The game is played with **one pointer only**: a mouse on desktop or one finger
on a touch screen. Keyboard and gamepad are optional extras for later and are
never required.

## Steering on a touch screen: the joystick (default)

A thumb put down anywhere (except on a button) becomes the centre of an invisible
stick; sliding it steers.

```
        thumb went down here      thumb now
                 o ------------------> x
                     direction = the boat's heading
                     length    = throttle
```

- **Direction**: from where the thumb landed to where it is now. The boat turns
  towards that direction on screen at its `handling` turn rate, as before.
- **Throttle**: the length of the slide, in game pixels (about 85 per cm on a phone
  held sideways): under 12 px nothing (coast, heading held), full throttle at
  110 px (about 1.3 cm), linear in between (`STICK` in `PointerController.ts`).
- **The centre follows**: slide further than 130 px and the centre is dragged
  along behind the thumb, so turning back never needs a long slide.
- **Reverse** and **release** work as with pointing (below).
- The stick is drawn faintly under the thumb: a ring for the full-throttle
  distance and a knob.

The point: the steering thumb stays in a small area wherever the river goes (the
right half for most people), so it never ends up over the item buttons, nor over
the river ahead. The option **Touch steering: Point** brings back the old way.

## Steering with a mouse (or with "Point"): "point where you want to go"

While the pointer is **held down** (left mouse button, or a finger with the
option), the boat drives towards it. A mouse always steers this way.

```
              pointer
                 x
                /
               /  distance d  ->  throttle
              /
          [boat]  -- heading turns towards the pointer
```

- **Direction**: the vector from the player's boat (in screen space) to the
  pointer is the *desired heading*. The boat turns towards it at the turn rate
  allowed by its `handling` stat; it does not snap.
- **Throttle**: the distance `d` between boat and pointer, in game pixels,
  sets the throttle:
  - `d < deadZone` (40 px): throttle 0, heading held. This lets you
    hold your finger on the boat to coast without turning.
  - `d >= fullThrottleDistance` (180 px): throttle 1.
  - In between: linear from 0 to 1.
- **Pointer released**: throttle 0, the boat coasts and slows down from water
  drag. There is no brake; turning hard and releasing slows you down quickly
  enough.
- **Reverse**: pointing behind the boat (more than 120 degrees from the
  heading) while it is almost stopped (< 20 % of top speed) makes it reverse
  slowly. This is how you get off a bank you drove into head-first.

Because the camera follows the boat, the boat always stays near the same spot
on screen. Holding the finger still in one place therefore acts like a virtual
joystick around the boat: hold above-right of the boat and it keeps turning
until it heads up-right on screen.

### Optional mode: "on release"

Option for players who don't like holding the button: **Tap to set a target**.
A tap places a target marker in the world; the boat drives towards it at full
throttle until it gets within 60 px, then coasts. A new tap moves the marker.
Off by default.

## Using items

**Two hands on a phone**: steer with one finger (right hand), fire with the other thumb. The item
buttons are bottom left for the left thumb; the option "Item buttons on the right" swaps them for
people who steer with the left hand. Rules that keep the buttons out of the way:

- **A button never blocks steering.** A finger that lands on a button while no other finger is
  steering also steers (with the joystick, the stick is centred on the button). If it's a quick tap (under 0.3 s, moving less than 30 px) the item fires
  as well; if it stays down or drags, it was only steering. A quick downward flick fires backwards.
- **With a finger already steering**, a press on a button is just a press on the button: it fires
  when the thumb lifts (backwards after a downward flick), however long it was held.
- **Only a press that started on a button counts.** A steering finger that slides onto an item
  button, the pause button or the fullscreen button and lifts there does nothing.
- The buttons answer a little beyond their drawn ring (25 % wider), since a thumb doesn't aim.


| Input | Action |
| --- | --- |
| **Right mouse button**, anywhere | Fire the **first** item (works while the left button is held for steering) |
| **Middle mouse button**, anywhere | Fire the **second** item |
| Tap the item buttons (bottom left, numbered 1 and 2; bottom right with the option) | Fire that item forwards |
| Second finger tap, anywhere else (multi-touch) | Fire the first item |
| Swipe down on an item button | Fire that item **backwards** (Volunteers, Drill, Silicone Gun, see below) |
| `Space` / `E` | Fire the first / second item; hold `Shift` to fire backwards |

- You hold **two items**. A new item goes into the first free slot. Each button
  shows its item's picture and its **name underneath** (and `x2`/`x3` for
  multi-use items).
- Right and middle click work even when the pointer is over an item button.
- The item buttons are large (140 px across in the 1280 x 720 game, a little
  over 1.5 cm on a phone), bottom left, away from the steering thumb.
- Backwards fire: Volunteers are thrown backwards in a straight line (no homing),
  and the Drill and the Silicone Gun are fired backwards. Glue and Fake Crates are
  always dropped behind, and so are the cheese of the Raclette and the smoke of the
  Clogged Toilet; swiping makes no difference for them, nor for Jigsaw, White Powder,
  Mushrooms, Beer, Electrical Failure or the Kärcher. The Raclette always shoots ahead.

## Fullscreen on phones and tablets

- **Android (Chrome, Firefox):** the first tap on the title screen enters
  fullscreen and asks for landscape. There is also a fullscreen button on the
  title screen and next to the pause button during a race.
- **iPhone Safari:** browsers on iPhone don't allow fullscreen for web pages
  (iPad does). Use **Share, Add to Home Screen**: the game then opens full
  screen with no browser bars, using `public/manifest.webmanifest` and the
  `apple-mobile-web-app-*` tags in `index.html`.
- In portrait a "please rotate your device" overlay covers the game.

## Menus

- Every menu works with taps and clicks only. Buttons have hover states on
  desktop and pressed states on touch.
- Boat and track carousels can be swiped or browsed with arrow buttons.
- `Esc` (desktop) or the pause button (top centre) opens the pause menu.

## Implementation notes

- Use Phaser's pointer input with `this.input.addPointer(1)` so that a second
  finger is tracked for the multi-touch fire.
- Disable the browser context menu on the canvas
  (`this.input.mouse.disableContextMenu()`) so right-click can fire.
- Prevent page scrolling, pinch zoom and pull-to-refresh on the canvas
  (`touch-action: none` and a proper viewport meta tag).
- Convert the pointer to the boat's position in **screen** space, not world
  space, so steering keeps working while the camera moves.
- The input layer produces a plain `ControlIntent` object each frame:

  ```ts
  interface ControlIntent {
    desiredHeading: number | null; // radians, null = keep current heading
    throttle: number;              // 0..1, negative for reverse
    fire: 'none' | 'forward' | 'backward';
  }
  ```

  The AI produces the same object (see [AI](ai.md)), so player boats and AI
  boats run through exactly the same physics code.

## Accessibility

- **Auto-fire** (option): fires a held item automatically when the AI's own
  targeting logic would (a good target in range). You can still fire by hand.
- **Left-handed** (option): the item buttons move to the bottom left.
- **Reduced screen shake** option (also turns off hit pauses).
- No steering assist, by design.
- All important information uses shapes and text as well as colour.
