# README

## Notes on transitioning to relational database

Create tables with both `id` and `firebase_id` columns that maintain referential
integrity. We can then update the references by adding other columns and
enforcing constraints.
