-- TEMPORARY verification seed — real range scraped live this session for
-- theater 2116 / layoutId 130 (La La Land 10th Anniversary, auditorium 1).
-- Will be deleted via a follow-up migration once StarDialog rendering is
-- confirmed in the browser; not meant to be a permanent migration.
insert into seat_layouts (theater_id, layout_id, row_min, row_max, seat_min, seat_max)
values (2116, 130, 'A', 'N', 1, 28);
