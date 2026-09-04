#!/usr/bin/env python3
"""Reproducible appendix for "Relativized Irreducibility and Emergence Pressure", §14.4.

Runs the paper's instantiated falsifiers for the six-axis backend case study:

  * the case-study specification (case-study.spec.yaml, beside this file),
  * the eight seeded mutations of §13.5 (M1-M8),
  * the four-case valid-extension suite of §14.4.1 (E1-E4),
  * the validator-runtime growth series of §14.4.2, row 9 (k cloned slices),

through the validators the case study names:

  schema   JSON Schema 2020-12, backend_spec.schema.v1.1.0
  closure  closure_laws.validate: laws L3-L18 as function-free checks
  engine   rule_engine.py with rule_catalog_v1_1_0.json (270 rules)
  runtime  observed error classes minus interface.error_taxonomy (M8 only)

The validators are the backend-specification toolchain; point at its checkout with
--toolchain or BACKEND_SPEC_TOOLCHAIN. results.json beside this file is the recorded
run the paper quotes. Re-run to regenerate it; every number in §13.6 and §14.4 comes
from that file.

Python is used because the closure-law validator is a Python module that this runner
imports directly; the rule engine is invoked as a subprocess.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import os
import platform
import statistics
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path

import jsonschema
import yaml

HERE = Path(__file__).resolve().parent
SPEC_FILE = HERE / "case-study.spec.yaml"
RESULTS_FILE = HERE / "results.json"
DEFAULT_TOOLCHAIN = Path("/home/admin/codebases/helioum-cat")


# --- mutations (§13.5) and extensions (§14.4.1) --------------------------------

def m1(s):  # grammar/schema: non-numeric status
    s["interface"]["operation_bindings"][0]["http"]["success_status"] = "OK"

def m2(s):  # local semantic: string-only constraint on a decimal type
    s["data_model"]["primitive_types"]["Money"]["min_length"] = 3

def m3(s):  # cross-reference: undeclared aggregate
    s["operations"]["commands"]["SubmitOrder"]["target_aggregate"] = "MissingAggregate"

def m4(s):  # closure law: emitted event not declared
    del s["operations"]["events"]["OrderSubmitted"]

def m5(s):  # closed-world: transition command drops the required stale_version synthetic error
    cmd = s["operations"]["commands"]["SubmitOrder"]
    cmd["errors"] = [e for e in cmd["errors"] if e != "stale_version"]
    del cmd["synthetic_errors"]["stale_version"]
    del s["interface"]["operation_bindings"][0]["http"]["error_status_map"]["stale_version"]

def m6(s):  # canonical pattern: error class mapped to a success status
    s["interface"]["operation_bindings"][0]["http"]["error_status_map"]["invalid_state"] = 200

def m7(s):  # observability contract: trace_id dropped from required log fields
    f = s["cross_cutting"]["observability"]["logging"]["required_fields"]
    s["cross_cutting"]["observability"]["logging"]["required_fields"] = [x for x in f if x != "trace_id"]

def m8(s):  # runtime escape: spec unchanged; production observed to emit `timeout`
    pass

def e1(s):  # declared-open region: vendor metadata
    s["x-vendor"] = {"annotator": "acme", "note": "non-semantic annotation"}

def e2(s):  # declared-open region: plugin extensions outside the minimal core
    s["extensions"] = {"plugins": [{"name": "audit-export", "version": "0.1.0"}]}

def e3(s):  # declared-open region: custom observability exporter
    s["cross_cutting"]["observability"]["exporters"] = {"otlp": {"endpoint": "http://collector:4317"}}

def e4(s):  # open until bound: future transport declared, bound to nothing
    s["interface"]["transports"]["grpc"] = {"kind": "grpc", "version": "1"}

ARTIFACTS = [
    ("V0", "valid case-study specification", None, "none"),
    ("M1", "success_status: \"OK\"", m1, "schema"),
    ("M2", "Money.min_length on a decimal", m2, "local-semantic"),
    ("M3", "target_aggregate: MissingAggregate", m3, "cross-reference"),
    ("M4", "OrderSubmitted emitted but undeclared", m4, "closure-law"),
    ("M5", "transition command without stale_version", m5, "closed-world"),
    ("M6", "invalid_state -> 200", m6, "canonical-pattern"),
    ("M7", "trace_id dropped from required_fields", m7, "observability"),
    ("M8", "runtime emits `timeout` (spec unchanged)", m8, "runtime-observation"),
    ("E1", "vendor metadata (x-vendor) at root", e1, "open: accept"),
    ("E2", "plugin extensions block at root", e2, "open: accept"),
    ("E3", "custom observability exporter", e3, "open: accept"),
    ("E4", "grpc transport declared, unbound", e4, "open: accept"),
]

OBSERVED_RUNTIME_ERRORS = {"M8": {"timeout"}}

REGISTRIES = [
    ("data_model", "identifier_types"), ("data_model", "named_patterns"), ("data_model", "enumerations"),
    ("data_model", "entities"), ("data_model", "aggregates"),
    ("operations", "commands"), ("operations", "queries"), ("operations", "events"),
    ("behavior", "state_machines"), ("behavior", "invariants"),
]


class Toolchain:
    """The three external validators, located under one checkout."""

    def __init__(self, root: Path, workdir: Path):
        self.root = root
        self.schema_path = root / "static" / "schemas" / "backend_spec.schema.v1.1.0.json"
        self.catalog = root / "tools" / "rule_catalog_v1_1_0.json"
        self.engine_path = root / "tools" / "rule_engine.py"
        for p in (self.schema_path, self.catalog, self.engine_path, root / "tools" / "closure_laws.py"):
            if not p.exists():
                raise SystemExit(f"toolchain file missing: {p}")
        sys.path.insert(0, str(root / "tools"))
        import closure_laws  # noqa: WPS433 (validator module of the toolchain)
        self.closure_laws = closure_laws
        self.validator = jsonschema.Draft202012Validator(json.loads(self.schema_path.read_text()))
        self.workdir = workdir

    def schema(self, spec):
        t = time.perf_counter()
        errs = sorted(self.validator.iter_errors(spec), key=lambda e: list(e.absolute_path))
        return {"errors": [f"{'/'.join(map(str, e.absolute_path))}: {e.message[:110]}" for e in errs],
                "ms": round((time.perf_counter() - t) * 1000, 2)}

    def closure(self, spec):
        t = time.perf_counter()
        errs = self.closure_laws.validate(spec)
        return {"errors": [str(e) for e in errs], "ms": round((time.perf_counter() - t) * 1000, 2)}

    def engine_call(self, path: Path):
        t = time.perf_counter()
        proc = subprocess.run([sys.executable, str(self.engine_path), str(path), "--catalog", str(self.catalog), "--json"],
                              capture_output=True, text=True)
        ms = round((time.perf_counter() - t) * 1000, 1)
        if proc.returncode == 2:
            raise RuntimeError(f"engine CLI error: {proc.stderr.strip()[:300]}")
        return json.loads(proc.stdout), ms

    def engine_overhead_ms(self, n=5):
        ts = []
        for _ in range(n):
            t = time.perf_counter()
            subprocess.run([sys.executable, str(self.engine_path), "--catalog", str(self.catalog), "--list-aliases"],
                           capture_output=True, text=True)
            ts.append((time.perf_counter() - t) * 1000)
        return round(statistics.median(ts), 1)

    def engine(self, spec, tag):
        path = self.workdir / f"{tag}.json"
        path.write_text(json.dumps(spec, indent=2))
        data, ms = self.engine_call(path)
        key = lambda f: [f.get("rule_id"), f.get("path"), f.get("message")]  # noqa: E731
        findings = data.get("findings", [])
        return {"errors": [key(f) for f in findings if f.get("severity") == "error"],
                "warnings": [key(f) for f in findings if f.get("severity") == "warning"], "ms": ms}


def run_runtime(spec, tag):
    observed = OBSERVED_RUNTIME_ERRORS.get(tag)
    if observed is None:
        return None
    escaped = sorted(observed - set(spec["interface"]["error_taxonomy"].keys()))
    return {"errors": [f"runtime error class '{e}' not in error_taxonomy" for e in escaped], "ms": 0.0}


def cloned_spec(base, base_text, k):
    spec = copy.deepcopy(base)
    for i in range(2, k + 1):
        t = base_text.replace("order_lifecycle", f"order_lifecycle{i}").replace("order_id", f"order{i}_id")
        t = t.replace("/orders/", f"/orders{i}/").replace("Order", f"Order{i}")
        c = json.loads(t)
        for a, b in REGISTRIES:
            spec[a][b].update(c[a][b])
        spec["interface"]["operation_bindings"].extend(c["interface"]["operation_bindings"])
        spec["cross_cutting"]["authorization"]["policies"].extend(c["cross_cutting"]["authorization"]["policies"])
    return spec


def growth(tc: Toolchain, base, base_text):
    overhead = tc.engine_overhead_ms()
    rows = []
    for k in (1, 2, 4, 8, 16):
        spec = cloned_spec(base, base_text, k)
        path = tc.workdir / f"growth-k{k}.json"
        path.write_text(json.dumps(spec, indent=2))
        se, ce = len(tc.schema(spec)["errors"]), len(tc.closure(spec)["errors"])
        times, nerr = [], None
        for _ in range(5):
            data, ms = tc.engine_call(path)
            times.append(ms)
            nerr = data["summary"]["errors"]
        med = round(statistics.median(times), 1)
        size = sum(1 for line in json.dumps(spec, indent=2).splitlines() if line.strip())
        rows.append({"k": k, "json_lines": size, "schema_errors": se, "closure_errors": ce, "engine_errors": nerr,
                     "engine_ms_median": med, "engine_eval_ms": round(med - overhead, 1)})
    return {"engine_overhead_ms": overhead, "rows": rows}


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--toolchain", type=Path, default=Path(os.environ.get("BACKEND_SPEC_TOOLCHAIN", DEFAULT_TOOLCHAIN)),
                    help="checkout of the backend-specification toolchain (schema, closure_laws.py, rule_engine.py)")
    ap.add_argument("--no-write", action="store_true", help="print results without rewriting results.json")
    args = ap.parse_args(argv)

    spec_bytes = SPEC_FILE.read_bytes()
    base = yaml.safe_load(spec_bytes)
    base_text = json.dumps(base, indent=2)
    spec_lines = sum(1 for line in spec_bytes.decode().splitlines() if line.strip() and not line.startswith("#"))

    with tempfile.TemporaryDirectory(prefix="falsifiers-", dir=HERE) as tmp:
        tc = Toolchain(args.toolchain, Path(tmp))
        results, base_engine = [], None
        for tag, desc, mut, intended in ARTIFACTS:
            spec = copy.deepcopy(base)
            if mut:
                mut(spec)
            r = {"tag": tag, "desc": desc, "intended_layer": intended, "schema": tc.schema(spec),
                 "closure": tc.closure(spec), "engine": tc.engine(spec, tag), "runtime": run_runtime(spec, tag)}
            as_keys = lambda rows: {tuple(x) for x in rows}  # noqa: E731
            if tag == "V0":
                base_engine = {"errors": as_keys(r["engine"]["errors"]), "warnings": as_keys(r["engine"]["warnings"])}
            r["engine"]["new_errors"] = sorted(as_keys(r["engine"]["errors"]) - base_engine["errors"])
            r["engine"]["new_warnings"] = sorted(as_keys(r["engine"]["warnings"]) - base_engine["warnings"])
            rejected = [k for k in ("schema", "closure") if r[k]["errors"]]
            if r["engine"]["new_errors"] or (tag == "V0" and r["engine"]["errors"]):
                rejected.append("engine")
            if r["runtime"] and r["runtime"]["errors"]:
                rejected.append("runtime")
            r["rejected_by"] = rejected
            results.append(r)
        g = growth(tc, base, base_text)

    record = {
        "run_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "python": platform.python_version(),
        "spec_file": SPEC_FILE.name,
        "spec_sha256": hashlib.sha256(spec_bytes).hexdigest(),
        "spec_non_empty_lines": spec_lines,
        "toolchain": {"root": str(args.toolchain), "schema": tc.schema_path.name,
                      "schema_sha256": hashlib.sha256(tc.schema_path.read_bytes()).hexdigest(),
                      "catalog": tc.catalog.name, "catalog_sha256": hashlib.sha256(tc.catalog.read_bytes()).hexdigest()},
        "artifacts": results,
        "growth": g,
    }
    if not args.no_write:
        RESULTS_FILE.write_text(json.dumps(record, indent=2, default=list) + "\n")

    print(f"spec {SPEC_FILE.name}: {spec_lines} non-empty lines, sha256 {record['spec_sha256']}")
    print(f"\n{'tag':4} {'intended':20} {'schema':>7} {'closure':>8} {'eng-new-err':>12} {'eng-new-warn':>13} {'runtime':>8}  rejected_by")
    for r in results:
        rt = "-" if r["runtime"] is None else len(r["runtime"]["errors"])
        ee = len(r["engine"]["errors"]) if r["tag"] == "V0" else len(r["engine"]["new_errors"])
        ew = len(r["engine"]["warnings"]) if r["tag"] == "V0" else len(r["engine"]["new_warnings"])
        print(f"{r['tag']:4} {r['intended_layer']:20} {len(r['schema']['errors']):>7} {len(r['closure']['errors']):>8} "
              f"{ee:>12} {ew:>13} {rt:>8}  {','.join(r['rejected_by']) or 'ACCEPTED'}")
    print()
    for r in results:
        print(f"== {r['tag']} — {r['desc']}  (schema {r['schema']['ms']} ms, closure {r['closure']['ms']} ms, engine {r['engine']['ms']} ms)")
        for k in ("schema", "closure", "runtime"):
            if r[k] and r[k]["errors"]:
                for e in r[k]["errors"][:6]:
                    print(f"   [{k}] {e}")
        for e in (r["engine"]["errors"] if r["tag"] == "V0" else r["engine"]["new_errors"]):
            print(f"   [engine] {e[0]} {e[1]}: {str(e[2])[:100]}")
        for w in (r["engine"]["warnings"] if r["tag"] == "V0" else r["engine"]["new_warnings"]):
            print(f"   [engine-warning] {w[0]} {w[1]}: {str(w[2])[:100]}")
    print(f"\n== growth (engine overhead, catalog load only: {g['engine_overhead_ms']} ms)")
    print(f"{'k':>3} {'json_lines':>10} {'schema':>7} {'closure':>8} {'eng-err':>8} {'engine_ms':>10} {'eval_ms':>8} {'eval_ms/k':>10}")
    for row in g["rows"]:
        print(f"{row['k']:>3} {row['json_lines']:>10} {row['schema_errors']:>7} {row['closure_errors']:>8} {row['engine_errors']:>8} "
              f"{row['engine_ms_median']:>10} {row['engine_eval_ms']:>8} {row['engine_eval_ms']/row['k']:>10.1f}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
