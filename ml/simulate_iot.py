import argparse
import csv
import json
import math
import random
from datetime import datetime, timedelta, timezone
from pathlib import Path


def simulate(hours: int, interval_minutes: int, seed: int, stress: bool):
    random.seed(seed)
    points = []
    total_points = max(1, int(hours * 60 / interval_minutes))
    start = datetime.now(timezone.utc) - timedelta(minutes=interval_minutes * (total_points - 1))

    for index in range(total_points):
        phase = (index % max(1, int(24 * 60 / interval_minutes))) / max(1, int(24 * 60 / interval_minutes))
        temperature = 27 + 5 * math.sin(2 * math.pi * (phase - 0.25)) + random.uniform(-0.7, 0.7)
        moisture = 48 - 8 * math.sin(2 * math.pi * (phase - 0.1)) + random.uniform(-1.5, 1.5)
        ph = 6.6 + 0.25 * math.sin(2 * math.pi * phase) + random.uniform(-0.06, 0.06)
        ec = 0.9 + 0.08 * math.sin(2 * math.pi * phase) + random.uniform(-0.03, 0.03)

        if stress and index > total_points * 0.65:
            moisture -= 14
            temperature += 3
            ec += 0.5

        points.append(
            {
                "timestamp": (start + timedelta(minutes=index * interval_minutes)).isoformat(),
                "soilMoisturePct": round(max(0, min(100, moisture)), 2),
                "soilPh": round(max(3.5, min(9.5, ph)), 2),
                "temperatureC": round(temperature, 2),
                "electricalConductivityDsM": round(max(0, ec), 3),
                "lightLux": round(30000 + 18000 * max(0, math.sin(2 * math.pi * phase)) + random.uniform(-1200, 1200), 2),
            }
        )

    return points


def main():
    parser = argparse.ArgumentParser(description="Generate realistic IoT farm sensor simulation data.")
    parser.add_argument("--hours", type=int, default=72)
    parser.add_argument("--interval-minutes", type=int, default=30)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--stress", action="store_true", help="Inject late-stage drought/salinity stress.")
    parser.add_argument("--out", type=Path, default=Path("ml/artifacts/iot-simulation.csv"))
    args = parser.parse_args()

    points = simulate(args.hours, args.interval_minutes, args.seed, args.stress)
    args.out.parent.mkdir(parents=True, exist_ok=True)

    if args.out.suffix.lower() == ".json":
        args.out.write_text(json.dumps(points, indent=2), encoding="utf-8")
    else:
        with args.out.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=list(points[0].keys()))
            writer.writeheader()
            writer.writerows(points)

    print(f"Saved {len(points)} IoT readings to {args.out.resolve()}")


if __name__ == "__main__":
    main()
