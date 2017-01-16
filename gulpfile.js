const gulp = require("gulp");
const babel = require("gulp-babel");
const ts = require('gulp-typescript');
const change = require('gulp-change');
const clean = require('gulp-clean');
const chmod = require('gulp-chmod');

gulp.task('build', function() {
    const tsProject = ts.createProject('tsconfig.json', function() {
        typescript: require('typescript');
    });

    gulp.src('src/*.ts')
        .pipe(tsProject())
        .pipe(babel({
            presets: ['es2015']
        }))
        .pipe(gulp.dest('dist'));
});

gulp.task('build:scripts', function() {
    const tsProject = ts.createProject('scripts/src/tsconfig.json', function() {
        typescript: require('typescript');
    });
    const head = `#!/usr/bin/env node

`;

    return gulp.src('scripts/src/*.ts')
        .pipe(tsProject())
        .pipe(babel({
            presets: ['es2015']
        }))
        .pipe(change((content) => head + content))
        .pipe(chmod(0o755))
        .pipe(gulp.dest('scripts'));
});

gulp.task('watch', function() {
    gulp.watch('src/*.ts', ['lib']);
});

gulp.task('clean', function() {
    return gulp.src('dist/*', { read: false }).pipe(clean());
});

gulp.task('watch:scripts', ['scripts'], function() {
    gulp.watch('scripts/src/*.ts', ['scripts']);
});

gulp.task('clean:scripts', function() {
    return gulp.src('scripts/*.js', { read: false }).pipe(clean());
});

gulp.task('default', ['build', 'build:scripts']);
