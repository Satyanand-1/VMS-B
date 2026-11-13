-- A resubmission or a replaced file keeps the same invoice number with a new version (REC-6, REC-7, INV-12).
alter table submissions drop constraint submissions_ref_key;
alter table submissions add constraint submissions_ref_version_key unique (ref, version_no);
