-- Removes the temporary verification seed from 0008_test_seed_verify.sql.
delete from seat_layouts where theater_id = 2116 and layout_id = 130;
