import json
import glob
import os
import re

def sanitize_filename(name):
    cleaned = re.sub(r'[^\w\s-]', '', name).strip()
    return re.sub(r'[\s]+', '_', cleaned).lower()

def extract_subjects_from_questions(questions_dir="questions", subjects_dir="subjects"):
    if not os.path.exists(questions_dir):
        print(f"Error: Directory '{questions_dir}' not found.")
        return

    pattern = os.path.join(questions_dir, "gsp_*.json")
    files = glob.glob(pattern)

    if not files:
        print(f"No files matching 'gsp_*.json' found in '{questions_dir}/'.")
        return

    os.makedirs(subjects_dir, exist_ok=True)
    subjects_map = {}
    years_detected = set()

    for fpath in files:
        fname = os.path.basename(fpath)
        yr_match = re.search(r'gsp_(\d{4})\.json', fname)
        file_yr = yr_match.group(1) if yr_match else None

        try:
            with open(fpath, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception as e:
            print(f"Warning: Failed to read {fpath}: {e}")
            continue

        if not isinstance(data, list):
            print(f"Warning: Data in {fpath} is not a JSON list. Skipping.")
            continue

        for idx, q in enumerate(data):
            if not isinstance(q, dict):
                continue

            if "year" not in q and file_yr:
                q["year"] = file_yr
            elif "year" in q:
                q["year"] = str(q["year"])

            if q.get("year"):
                try:
                    years_detected.add(int(q["year"]))
                except ValueError:
                    pass

            if "qno" not in q:
                q["qno"] = str(idx + 1)
            else:
                q["qno"] = str(q["qno"])

            subj = (q.get("subject") or q.get("topic") or "General").strip()
            if subj not in subjects_map:
                subjects_map[subj] = []
            subjects_map[subj].append(q)

    manifest_subjects = []
    for subj, q_list in subjects_map.items():
        clean_name = sanitize_filename(subj)
        filename = f"subject_{clean_name}.json"
        out_path = os.path.join(subjects_dir, filename)
        with open(out_path, "w", encoding="utf-8") as out_f:
            json.dump(q_list, out_f, indent=2, ensure_ascii=False)
        print(f"Saved {len(q_list):>3} questions -> {out_path}")
        manifest_subjects.append({
            "name": subj,
            "filename": filename,
            "count": len(q_list)
        })

    manifest_data = {
        "subjects": sorted(manifest_subjects, key=lambda x: x["name"]),
        "years": sorted(list(years_detected)),
        "total_subjects": len(manifest_subjects)
    }
    manifest_path = os.path.join(subjects_dir, "manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as mf:
        json.dump(manifest_data, mf, indent=2, ensure_ascii=False)
    print(f"Saved manifest -> {manifest_path}")
    print(f"\nExtraction complete: {len(manifest_subjects)} subjects from {len(files)} year files.")

if __name__ == "__main__":
    extract_subjects_from_questions()